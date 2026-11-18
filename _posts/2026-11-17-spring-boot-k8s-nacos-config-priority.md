---
layout: post
title: Spring Boot 容器化部署的配置优先级与排障笔记
slug: spring-boot-k8s-nacos-config-priority
categories: [Spring]
description: 梳理 CI 打包、Dockerfile、启动脚本、JAVA_OPTS、Nacos 与 application.yml 的配置覆盖顺序，记录常见排障过程与拆分模板
keywords: Spring Boot, Nacos, Kubernetes, Docker, JAVA_OPTS, 配置优先级
---

发版切环境时，想在容器平台的 `JAVA_OPTS` 里加 `-DSPRING_PROFILES_ACTIVE=prod` 改掉 Profile，重启后毫无反应（见第三节 1）；到了开发环境，控制台一直在刷 MyBatis 的 SQL `DEBUG` 日志，明明在启动参数里加了 `-Dlogging.level.root=info` 也没拦住（见第四节 2）。

顺着这两个现象往下查，把 CI 打包、`Dockerfile`、启动脚本、容器环境变量、JVM `JAVA_OPTS`、Nacos 和 `application.yml` 的生效顺序完整捋了一遍。

> 本文结论基于 `Spring Boot 3.2.x` + `Spring Cloud Alibaba 2022.x / 2023.x`（使用 `spring.config.import` 机制导入 Nacos 配置）。

# 一、6 层配置优先级

当同一个配置项在多个地方同时出现时，越靠近最终运行命令、越在外部注入的配置，优先级越高。

在容器化部署场景下，日常接触最多的 6 层配置源（`PropertySource`）从高到低排序如下：

| 优先级 | 配置来源 | 典型写法 / 位置 | 说明 |
| :---: | :--- | :--- | :--- |
| **1（最高）** | **Spring 命令行参数** | `java -jar app.jar --spring.profiles.active=prod` | 写在 `.jar` **后面**，启动脚本最终传入的参数 |
| **2** | **JVM 系统属性** (`-D`) | `JAVA_OPTS="-Dlogging.level.root=info"` | 写在 `-jar` **前面**，既能给 YAML 占位符赋值，也能覆盖 Nacos |
| **3** | **容器 / OS 环境变量** | K8s `env:` 或 `Dockerfile` 的 `ENV` | 同名时 K8s `env:` 覆盖 `Dockerfile` 的 `ENV` |
| **4** | **Nacos 远程配置中心** | `spring.config.import: nacos:demo-app.yaml` | 日常动态调整业务参数、数据源、日志级别的位置 |
| **5** | **包内环境专属配置** | Jar 包内的 `application-{profile}.yml` | 通常只用来存放连接 Nacos 的地址与命名空间占位符 |
| **6（最低）** | **包内主配置文件** | Jar 包内的 `application.yml` | 前面 1~5 层都没配的项，才会落到这里用默认值 |

这里有三个边界需要注意：

1. **简化模型**：上表提取的是容器化部署高频使用的 6 层，省略了 `SPRING_APPLICATION_JSON`、Jar 包外部挂载目录（`./config/`）等来源；完整顺序见 Spring Boot 官方外部化配置文档 [1]。
2. **第 4 名与第 5 名的顺序**：在 `ConfigData` 机制下，由 Jar 包内 `application-{profile}.yml` 通过 `spring.config.import` 导入的 Nacos 配置，默认优先于触发导入的那个本地 YAML 文件。如果工程把配置文件挂载在 Jar 外，或使用了不同版本的客户端，建议以实测为准。
3. **按 Key 穿透合并 vs 列表整体覆盖**：
   普通键值对可以把这 6 层看作 **6 张叠在一起的半透明图层**——只要上面 1~5 层没写某个 Key（比如 Nacos 里没配 `logging.level`），就会一路往下穿透到第 6 层 `application.yml` 读取默认值。但**数组 / List 类型的配置**（如 `items[0]`、`items[1]`）除外，Spring Boot 对列表是按整体覆盖的，高优先级只要配了同名列表，低优先级的整个列表都会被替掉 [2]。

---

# 二、从打包到连上 Nacos 的 4 步交接

一次发版从构建镜像到容器内拉取 Nacos 配置，一共经过 4 步：

```text
[1. 打包阶段] CI 传入构建参数 (如 prod)
                 ↓
              Maven Profile 激活 → 传给 Dockerfile 构建参数
                 ↓
              Dockerfile 写入镜像: ENV app_profile=prod
                 ↓
[2. 启动阶段] 容器平台拉起镜像，注入平台配置的 JAVA_OPTS，执行 entrypoint.sh:
              java $JAVA_OPTS -jar app.jar --spring.profiles.active=$app_profile
                 ↓
[3. 寻址阶段] Spring 读取第 1 名的 --spring.profiles.active=prod
              → 先读底包 application.yml (第 6 名)
              → 按命名规则自动加载 application-prod.yml (第 5 名)
                 ↓
[4. 合并阶段] 用第 2 名的 -DNACOS_* 替换 application-prod.yml 里的 ${NACOS_*:默认值}
              → 连上目标 Nacos 拉回远程配置 (第 4 名)
              → 按 1~6 名优先级合并所有配置项
```

## 1. `Dockerfile` 和启动脚本会冲突吗？

看到 `Dockerfile` 写了环境变量，启动脚本 `entrypoint.sh` 里又写了 `--spring.profiles.active`，容易以为两边重复。实际上它们是一存一取的配合关系：

```dockerfile
# Dockerfile：构建镜像时把环境名写进容器环境变量
ARG PROFILE_ACTIVE=dev
ENV app_profile=${PROFILE_ACTIVE}
```

```bash
# entrypoint.sh：容器启动时读出该变量，拼到命令行末尾（第 1 名）
exec java $JAVA_OPTS -jar /app/demo-app.jar --spring.profiles.active=$app_profile
```

看启动脚本时，要注意区分一条 `java` 命令里三个不同位置的参数：

```bash
java -Xmx1g -XX:+UseG1GC -Dserver.port=8081 -jar app.jar --server.port=8082
#    └──────── ① ──────┘ └─────── ② ──────┘              └─────── ③ ──────┘
```

- **位置 ①（JVM 自身参数）**：`-Xmx`、`-XX:`、`-javaagent`，由 JVM 直接消费，给虚拟机配内存、GC 和探针。
- **位置 ②（JVM 系统属性 `-D`）**：写在 `-jar` 前面，在 Spring 配置优先级里排**第 2 名**。
- **位置 ③（Spring 命令行参数 `--`）**：写在 `.jar` 后面，在 Spring 配置优先级里排**第 1 名**（上面这条命令最终端口是 `8082`）。

## 2. Spring 是怎么自动找到 `application-prod.yml` 的？

拿到 `--spring.profiles.active=prod` 后，Spring Boot 是怎么对应到文件的？

- **钥匙与房间**：`spring.profiles.active` 相当于钥匙，`application-prod.yml` 是用 `prod` 这把钥匙打开的房间。Spring 确定激活的 Profile 是 `prod` 后，会按内置的 `application-{profile}.yml` 命名约定自动去 `classpath` 下加载 `application-prod.yml`。
- **为什么 `application-prod.yml` 里没有写 `spring.profiles.active`？**
  一是因为因果顺序：必须先确定 Profile 是 `prod`，才会去打开 `application-prod.yml`；二是因为 **Spring Boot 2.4+ 明确禁止在环境专属文件**（`application-{profile}.yml`）中再次设置 `spring.profiles.active`，否则启动会直接抛 `InvalidConfigDataPropertyException` [2]。
- **`application.yml` 里的 `active: ${SPRING_PROFILES_ACTIVE:local}` 还有用吗？**
  在容器里确实没用上。因为启动脚本末尾的第 1 名（`--spring.profiles.active=prod`）已经定死了环境，第 6 名 `application.yml` 里的这行配置不管算出来是什么都会被忽略。保留它的唯一作用是：**在本地用 IDE 直接点 Run 启动时**（不走容器的 `entrypoint.sh`），没人传命令行参数，它会自动回退激活 `local`，去加载 `application-local.yml`。

---

# 三、为什么同样在 `JAVA_OPTS` 里配 `-D`，有的失效、有的生效？

在容器平台的 `JAVA_OPTS` 里同时配了 `-DSPRING_PROFILES_ACTIVE=prod` 和 `-DNACOS_SERVER_ADDR=nacos.internal:8848`，前者改不掉环境，后者却能连上 Nacos。用不用把大写的 `-DNACOS_*` 改成小写？

**结论是不需要改小写。** 这两个 `-D` 之所以结果不同，是因为背后涉及两个不同阶段：**占位符解析（Placeholder Resolution）** 和 **属性源优先级（PropertySource Precedence）**：

```text
【例子 A：-DSPRING_PROFILES_ACTIVE=prod 为什么输了？】
  阶段 1（占位符填空）：-DSPRING_PROFILES_ACTIVE=prod (第 2 名)
                           ↓ 填入第 6 名 application.yml 的 ${SPRING_PROFILES_ACTIVE:local}
  阶段 2（属性源比大小）：第 6 名 (active=prod)  PK  第 1 名 (--spring.profiles.active=dev)
                           ↓
                        【结果：被第 1 名覆盖，最终仍是 dev】

【例子 B：-DNACOS_SERVER_ADDR=nacos.internal:8848 为什么赢了？】
  阶段 1（占位符填空）：-DNACOS_SERVER_ADDR=... (第 2 名)
                           ↓ 填入第 5 名 application-prod.yml 的 ${NACOS_SERVER_ADDR:默认IP}
  阶段 2（属性源比大小）：第 5 名 (server-addr=...)  PK  第 1~4 名 (均未配置该属性，无人拦截)
                           ↓
                        【结果：直接胜出，成功连上目标 Nacos】
```

## 1. 为什么 `-DSPRING_PROFILES_ACTIVE=prod` 改不掉环境？

假设拿了一个 `dev` 镜像（镜像内 `app_profile=dev`），想在 `JAVA_OPTS` 里加 `-DSPRING_PROFILES_ACTIVE=prod` 切到生产配置：

1. **占位符解析阶段（替换成功）**：
   Spring 读第 6 名 `application.yml` 里的 `active: ${SPRING_PROFILES_ACTIVE:local}` 时，去第 2 名 `JAVA_OPTS` 里找到了同名属性，确实把 `application.yml` 里的这行值替换成了 `prod`。
   （注：如果不靠 `application.yml` 里这个占位符中转，Spring 原生认的 JVM 系统属性名是小写的 `-Dspring.profiles.active`，大写的 `SPRING_PROFILES_ACTIVE` 原生是给第 3 名操作系统环境变量用的。）
2. **属性源优先级阶段（被第 1 名覆盖）**：
   替换完成后，这个 `prod` 只是**第 6 名**（`application.yml`）给出的值。但启动脚本 `entrypoint.sh` 末尾还挂着**第 1 名**（`--spring.profiles.active=dev`）。第 1 名直接覆盖第 6 名，最终激活的仍然是 `dev`。

- **解决办法**：不要在 `JAVA_OPTS` 里加 `-DSPRING_PROFILES_ACTIVE`。正道是构建并部署对应环境的 `prod` 镜像；如果临时必须在容器平台切换环境，应该去容器环境变量 `env:` 里覆盖启动脚本读取的 `app_profile: prod`，让第 1 名 `--spring.profiles.active=$app_profile` 本身变成 `prod`。

## 2. 为什么 `-DNACOS_SERVER_ADDR` 和 `-DNACOS_NAMESPACE` 能生效？

看一眼 `application-prod.yml`（第 5 名）里的写法 [3]：

```yaml
spring:
  config:
    import: nacos:demo-app.yaml
  cloud:
    nacos:
      config:
        server-addr: ${NACOS_SERVER_ADDR:192.0.2.10:8848}
        namespace: ${NACOS_NAMESPACE:order-ns}
        username: ${NACOS_USERNAME:nacos}
        password: ${NACOS_PASSWORD:nacos}
```

1. **占位符解析阶段**：Spring 解析 `${NACOS_SERVER_ADDR:192.0.2.10:8848}` 时，按优先级找 `NACOS_SERVER_ADDR` 的值：命令行 `--` (第 1 名) ＞ **`JAVA_OPTS` 里的 `-D` (第 2 名)** ＞ 容器 `env` (第 3 名) ＞ 冒号后的默认值 `192.0.2.10:8848`。配在 `JAVA_OPTS` 里的 `-DNACOS_SERVER_ADDR` 直接胜出，填进 `application-prod.yml`。
2. **属性源优先级阶段**：填好后，它成为第 5 名的 `spring.cloud.nacos.config.server-addr`。因为启动脚本（第 1 名）里**并没有写死 Nacos 地址**，前面 1~4 名没有任何配置源跟它争抢这个属性，所以它填进去的值就是最终生效的值。
3. **为什么不用改成小写？**
   大写的 `-DNACOS_SERVER_ADDR` 是配合 YAML 里的 `${NACOS_SERVER_ADDR}` 占位符使用的自定义变量名，简短好记；如果改成小写，必须写成完整的 Spring 标准属性名 `-Dspring.cloud.nacos.config.server-addr=...`，没有必要。

> **安全提示**：如果把 `-DNACOS_PASSWORD=...` 直接写在 `JAVA_OPTS` 里，进容器执行 `ps aux` 时进程参数里会看到明文密码。对安全敏感的环境，可将账密放在容器 `env`（或 K8s Secret）里注入，YAML 里的 `${NACOS_PASSWORD}` 同样能作为第 3 名读取到。

## 3. 占位符名字写错与跨环境覆盖

- **占位符名字差一个符号，会静默退回默认值**：
  `${NACOS_NAMESPACE:order-ns}` 是精确匹配字符串名字的。如果 YAML 里是下划线 `NACOS_NAMESPACE`，而在 `JAVA_OPTS` 里写成了中划线 `-DNACOS-NAMESPACE=new-ns`，Spring 匹配不上名字，不会报错，而是直接退回使用冒号后面的默认值 `order-ns`。
- **用 `dev` 镜像配生产 `-DNACOS_*` 参数会发生什么？**
  如果部署的是 `dev` 镜像（加载 `application-dev.yml`），但在 `JAVA_OPTS` 里配了生产的 `-DNACOS_SERVER_ADDR` 和 `-DNACOS_NAMESPACE`：**只要 `application-dev.yml` 里也写了同名的 `${NACOS_*}` 占位符（没有把地址写死成字面量），它依然会连上生产的 Nacos**。因为第 2 名的 `-D` 照样会把 `application-dev.yml` 里的占位符全部替换成生产地址。当然，为了避免容器显示 `dev` 实际却连着 `prod` 造成误判，发版时还是应该使用对应环境的镜像。

---

# 四、三个常见排障场景与验证方法

## 1. 进容器 `echo $SPRING_PROFILES_ACTIVE` 为什么是空的？

Linux 环境变量区分大小写。如果镜像 `Dockerfile` 里定义的是小写变量（如 `ENV app_profile=dev`），容器里就没有大写的 `SPRING_PROFILES_ACTIVE`。

进容器核对真实环境时，用下面两条命令最准（进容器和查看 Pod 配置的常用命令可参考 [常用的 kubectl 排障命令]({{ site.url }}/2026/10/26/k8s-ops-cheatsheet/)）：

```bash
# 忽略大小写查环境变量
env | grep -i profile

# 直接看 java 进程实际带了什么参数（注意输出可能包含敏感信息，截图分享前先脱敏）
ps aux | grep java
```

除了进容器，也可以通过两种方式确认最终生效的配置：

- **看启动日志**：搜 `The following 1 profile is active: "prod"` 确认当前激活的 Profile，再搜关键词 `nacos` 或配置文件名（如 `demo-app.yaml`）核对实际拉取的远程配置。
- **查 Actuator 或 `--debug`**：如果内部环境开启了 `/actuator/env` 端点，可以直接看到每个配置项最终采纳的值以及它来自哪个 `PropertySource`。

## 2. 配了 `-Dlogging.level.root=info`，为什么还在刷 SQL `DEBUG`？

在 `JAVA_OPTS` 里加了 `-Dlogging.level.root=info`，控制台还是满屏 MyBatis SQL，原因是日志框架遵循**「包路径越具体，优先级越高（子包覆盖父包）」**：

```text
root (被 -D 设为 INFO)
 ├── org.springframework (未单独配置 → 继承 root 的 INFO)
 └── com.example.order (在 application.yml 或 Nacos 里配了 DEBUG → 覆盖 root)
      └── com.example.order.mapper (继承父包 DEBUG → 持续打印 SQL)
```

- `-Dlogging.level.root=info` 只管最顶层的 `root`，管不住下面单独配置了 `DEBUG` 的业务包或 Mapper 包。
- 哪怕 Nacos 里没有写任何 `logging.level` 配置，由于**按 Key 穿透**，底层 `application.yml` 里遗留的 `com.example.order: DEBUG` 仍然会穿透生效。
- 另外，如果项目重构改过包名（比如从 `com.old.app` 迁到了 `com.example.order`），以前留在 `JAVA_OPTS` 里的 `-Dlogging.level.com.old.app=DEBUG` 就不再匹配任何类了。
- **解决办法**：删掉主配置 `application.yml` 里写死的业务包 `DEBUG` 配置（挪到 `application-local.yml`），并在 Nacos 里显式把对应业务包或 Mapper 包设为 `INFO`（如 `logging.level.com.example.order.mapper: INFO`）。

## 3. 为什么别在 `JAVA_OPTS` 里放业务 `-D` 或 `-Dlogging`？

同样是 `-D` 参数，建议区分对待：

- **Nacos 寻址参数**（`-DNACOS_SERVER_ADDR`、`-DNACOS_NAMESPACE` 等）：只在启动连 Nacos 时用一次，放在容器平台的 `JAVA_OPTS` 或 `env` 里完全正常。
- **业务开关与具体包日志级别**（`-Dlogging.level.xxx`、`-Dcustom.switch`）：这类参数日常需要在 Nacos 控制台动态修改。一旦写进 **第 2 名**（`JAVA_OPTS`），就会一直压住 **第 4 名（Nacos）**——之后在 Nacos 网页上怎么改都不会生效，必须去容器平台改启动参数并重启容器。

---

# 五、配置文件拆分模板（防止生产回退读到测试配置）

如果主配置 `application.yml`（第 6 名）里塞满了本地开发用的测试库、Redis、Kafka 地址等，同时 `application-prod.yml` 里又写了 `optional:nacos:...`，线上会有三个隐患：

1. **漏配回退**：生产 Nacos 只要漏写了某一项（比如灰度名单），就会穿透到 `application.yml`，把本地测试配置带到生产环境。
2. **断网强启**：因为加了 `optional:`，如果发版时 Nacos 连不上，服务不会报错退出，而是直接用 `application.yml` 里的测试地址把服务启动起来。
3. **多模块合并**：如果 `order-web` 和 `order-server` 两个模块下都有 `application.yml`，打包后两边会合并；只删掉其中一个模块的 `DEBUG` 日志配置，另一个模块里的配置还会继续生效。

最稳妥的做法是：**只在启动模块保留唯一一套配置文件**，把本地开发配置全部挪进 `application-local.yml`。

## 1. `application.yml`（只留跨环境公共骨架 + 默认 `local`）

```yaml
server:
  port: 8080

spring:
  application:
    name: demo-app
  profiles:
    # 本地 IDE 直接点 Run 时无外部参数，默认激活 local，自动去读 application-local.yml
    active: ${SPRING_PROFILES_ACTIVE:local}

# 只留与环境无关的固定映射，不放任何环境的 IP、账密、业务开关或业务 DEBUG 日志
mybatis-plus:
  mapper-locations: classpath:/mapper/*Mapper.xml
  configuration:
    map-underscore-to-camel-case: true
```

## 2. `application-local.yml`（承接所有本地开发联调配置）

打包时所有 `application-*.yml` 都会打进同一个 Jar 包，但只有当 `profile=local` 时 Spring 才会加载这个文件，`dev` / `test` / `prod` 容器在运行时不会读取它：

```yaml
spring:
  datasource:
    url: jdbc:mysql://127.0.0.1:3306/demo_dev
    username: dev_user
    password: dev_password

logging:
  level:
    com.example.order: DEBUG
```

## 3. `application-prod.yml`（去掉 `optional:`，只放 Nacos 连接配置）

```yaml
spring:
  config:
    # 去掉 optional:，连不上 Nacos 时启动直接报错退出，避免带病上线
    import: nacos:demo-app.yaml
  cloud:
    nacos:
      config:
        server-addr: ${NACOS_SERVER_ADDR:192.0.2.10:8848}
        namespace: ${NACOS_NAMESPACE:order-ns}
        username: ${NACOS_USERNAME:nacos}
        password: ${NACOS_PASSWORD:nacos}
```

> **提示**：上面保留了 `:order-ns` 等默认值以兼容现有部署习惯；如果想追求更严格的 Fail-Fast（外部漏传或拼错 `-DNACOS_NAMESPACE` 时立刻阻止启动），可以直接去掉冒号和默认值，写成 `${NACOS_SERVER_ADDR}`、`${NACOS_NAMESPACE}`。

---

# 六、配置存放位置速查表

| 配置位置 | 优先级 | 适合放什么 | 不建议放什么 |
| :--- | :---: | :--- | :--- |
| **启动脚本末尾** `--` | **1** | `--spring.profiles.active=$app_profile` | 不要写死业务参数 |
| **容器平台** `JAVA_OPTS` | **2** | • JVM 内存/GC/探针（`-Xmx`、`-XX:+UseG1GC`、`-javaagent`）<br>• Nacos 寻址参数（`-DNACOS_SERVER_ADDR`、`-DNACOS_NAMESPACE` 等，注意符号与 YAML 占位符一致） | • 日常需在 Nacos 动态调整的业务开关或 `-Dlogging.level...`（会压住第 4 名的 Nacos）<br>• `-DSPRING_PROFILES_ACTIVE`（会被第 1 名覆盖） |
| **容器** `env:` / `Dockerfile` | **3** | 镜像环境标识（`ENV app_profile`）、基础设施环境变量或敏感凭证 | 频繁变动的业务参数 |
| **Nacos 远程配置中心** | **4** | 数据源、Redis、MQ、业务开关、各包名的 `logging.level` | `spring.profiles.active` |
| `application-{env}.yml` | **5** | `spring.config.import: nacos:...`（线上去掉 `optional:`）及 `${NACOS_*}` 占位符；本地联调配置统一放进 `application-local.yml` | 散落的业务参数（避免和 Nacos 两头维护） |
| `application.yml`<br>*(仅启动模块保留一份)* | **6** | `server.port`、`spring.application.name`、`active: ${SPRING_PROFILES_ACTIVE:local}`、ORM 映射等公共骨架 | 任何环境的数据库/中间件地址、账密、灰度名单或业务 `DEBUG` 日志 |

# 参考资料

- [1] [Spring Boot Reference — Externalized Configuration](https://docs.spring.io/spring-boot/reference/features/external-config.html)（官方外部化配置优先级顺序与 `spring.config.import` 规则）
- [2] [Spring Boot 2.4 ConfigData Migration Guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-Config-Data-Migration-Guide)（环境专属文件禁止设置 `spring.profiles.active`，以及列表类型配置的整体覆盖规则）
- [3] [Spring Cloud Alibaba Wiki — Nacos Config](https://sca.aliyun.com/docs/2023/user-guide/nacos/quick-start/)（Nacos `spring.config.import` 导入方式与配置项说明）
