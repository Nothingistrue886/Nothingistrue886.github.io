---
layout: post
title: 常用的 kubectl 排障命令
slug: k8s-ops-cheatsheet
categories: [运维与工具]
description: 按场景整理的 kubectl 命令。命名空间和资源名用占位符，复制后换成自己的再执行
keywords: Kubernetes, kubectl, Pod, 日志
---

Pod 起不来、要看日志、要核对镜像，敲的都是同一类命令。下面按场景收在一起。尖括号是占位符，终端不认识，复制后换成真实名字再回车。

# 一、先换再执行

| 记号 | 换成 | 说明 |
| --- | --- | --- |
| `<ns>` | 命名空间 | 按你们集群实际填写 |
| `<deploy>` | Deployment 名 | `kubectl get deploy -n <ns>` 的结果 |
| `<pod>` | 当前 Pod 名 | 先查出来再填，重建后会变 |
| `<app>` | 标签 `app` 的值 | 与清单里 `metadata.labels` 一致 |
| `<yaml>` | 清单文件 | 本地路径或仓库里的 manifest |
| `<node>` | 节点名 | `kubectl get node` 的结果 |
| `<keyword>` | 名字片段 | 全集群搜索时用 |
| `<svc>` | Service 名 | `kubectl get svc -n <ns>` 的结果 |
| `<cmd>` | 在容器里执行的一条命令 | 例如 `ls /tmp` |
| `<remote-path>` | 容器里的文件路径 | 以容器内实际路径为准 |
| `<local-file>` | 拷到本机后的文件名 | 写在当前目录下 |
| `<n>` | 副本个数 | `2` 是两个，`1` 是一个，`0` 是先停掉 |

尖括号要整段换成真实名字，括号本身不要留。命名空间是 `demo` 时，不要敲 `<ns>`，写成 `-n demo`。

```bash
# 文章里的写法，不能直接回车
kubectl get deploy,sts -n <ns>

# 换成自己的命名空间后再执行
kubectl get deploy,sts -n demo
```

`demo` 是假名字。Deployment、Pod、文件路径同样处理：看到 `<deploy>`、`<pod>`、`<yaml>`，整段替换掉。

# 二、资源在哪

先确认东西在哪个命名空间、叫什么名字。

列出这个命名空间里所有 Pod。`READY` 显示成 `几/几`：右边是容器总数，左边是已经就绪的个数，两边一样、`STATUS` 又是 `Running` 才算起来了。`CrashLoopBackOff`、`Pending`、`Error` 都要接着查。

```bash
kubectl get pods -n <ns>
```

`deploy` 是 Deployment，无状态服务一般用它。`sts` 是 StatefulSet，数据库这类要固定名字和存储的用它。这条把两种一起列出来。

```bash
kubectl get deploy,sts -n <ns>
```

Service 是访问入口，后面的 Pod 可以换。ClusterIP 一般只在集群内访问，NodePort 才会在节点上开口。`-o wide` 多打出类型、Cluster IP、端口和标签选择器，方便对照 Service 和 Pod 的标签是否一致。它不列出 Pod 名字；有没有后端，看第七节 `describe svc` 里的 Endpoints。

```bash
kubectl get svc -n <ns> -o wide
```

只记得名字的一部分，不知道在哪个命名空间。`-A` 表示所有命名空间。`grep` 只留下包含这个词的行。

```bash
kubectl get pod -A | grep <keyword>
```

# 三、配置、镜像和事件

`get -o yaml` 把这个 Deployment 的完整配置打出来：镜像、环境变量、副本数、挂载的目录都在里面。内容很长，适合确认「集群里现在这份配置到底是什么」。

```bash
kubectl -n <ns> get deploy <deploy> -o yaml
```

`describe` 不打整份 YAML，只打状态摘要。拉到最下面看 `Events`。`describe deploy` 里多半是扩缩容、滚动更新。拉镜像失败、探活失败、调度失败通常在 `describe pod` 里。CrashLoop 时先看 Pod 的 Events，再看日志。

```bash
kubectl -n <ns> describe deploy <deploy>
kubectl -n <ns> describe pod <pod>
```

下面这条只打三列：Pod 名、配置里写的镜像、这台 Pod 实际在跑的镜像 ID。发版后怀疑「还是旧镜像」时用。平时查日志用不到，可以先跳过。

```bash
kubectl get pods -n <ns> -o custom-columns=\
NAME:.metadata.name,\
IMAGE:.spec.containers[*].image,\
IMAGE_ID:.status.containerStatuses[*].imageID
```

行尾的 `\` 表示这一行还没写完，和下一行连成一条命令。

# 四、日志

Deployment 名一般不变，Pod 名每次重建都会变。所以优先写成 `deploy/<deploy>`，让 kubectl 自己找它当前的 Pod。副本多于 1 时，这条往往只打出其中一个 Pod 的日志。要对某一个，用下面的 `<pod>`。

看这个 Deployment 已经打出来的日志，打完就回到命令行：

```bash
kubectl -n <ns> logs deploy/<deploy>
```

`-f` 是跟着看。程序再打一行，这里就多一行，类似 `tail -f`。看完按 `Ctrl+C` 停掉。本机或节点能监视的文件数用完时，跟踪会中途退出，Pod 不一定挂了。这时改用下面的 `--tail`。

```bash
kubectl -n <ns> logs -f deploy/<deploy>
```

`--tail=200` 只取最后 200 行，取完就退出，不会一直占着。

```bash
kubectl -n <ns> logs --tail=200 deploy/<deploy>
```

同一个 Deployment 有好几个 Pod，又只想看其中某一个时，把 `<pod>` 换成 `get pods` 里那一行的名字：

```bash
kubectl -n <ns> logs <pod>
kubectl -n <ns> logs --tail=200 <pod>
```

# 五、进容器和拷文件

进到容器里面，之后敲的命令是在容器里执行的。`exit` 回到自己的机器。镜像里没有 `bash` 时，把最后的 `bash` 改成 `sh`。

```bash
kubectl -n <ns> exec -it <pod> -- bash
```

不进容器，只让它跑一条命令。`--` 后面换成要执行的命令，例如 `ls /tmp`。跑完结果打在当前窗口。

```bash
kubectl -n <ns> exec deploy/<deploy> -- <cmd>
```

文件在容器里，要拷到自己机器上。先看这个路径在不在、文件有多大，再拷。`<remote-path>` 是容器里的路径，`<local-file>` 是拷到当前目录后的文件名。数据库慢日志的路径每套环境不一样，以容器里实际路径为准。

```bash
kubectl -n <ns> exec <pod> -- ls -lh <remote-path>
kubectl -n <ns> cp <pod>:<remote-path> ./<local-file>
```

# 六、更新配置和改副本数

这三条互不依赖，用到哪条看哪条。

YAML 里常见两种东西，管的事不一样：

- **Deployment** 管程序怎么跑：用哪个镜像、跑几个 Pod、环境变量是什么。它不负责外面从哪个端口进来。
- **Service** 管怎么访问这些 Pod：对内或对外的端口都写在这里。你改对外端口，改的就是 Service，不是 Deployment。

一份 YAML 可以只写其中一个，也可以两个都写。`apply -f` 只是把这份文件交给集群：文件里有什么，就创建什么；已经有同名的，就按文件更新。平时走流水线发版的话，这条是流水线在执行，你本机不一定要敲。只有自己改了一份 YAML、要让集群按这份文件生效时才用。`<yaml>` 换成文件路径。

```bash
kubectl -n <ns> apply -f <yaml>
```

`-l app=<app>` 是按标签筛选，不是按 Deployment 名字筛选。Pod 上打了 `app=web` 这种标签时，`<app>` 就填 `web`，只会列出带这个标签的 Pod。标签和 Deployment 名字经常不一样，不确定就不要用这条，直接 `kubectl get pods -n <ns>`。

```bash
kubectl -n <ns> get pod -l app=<app>
```

`scale` 只改副本数，不改镜像，也不改配置。`<n>` 换成要跑几个 Pod：`2` 就是两个，`1` 就是一个，`0` 就是先停掉（Pod 会被删掉，Deployment 还在，之后再 scale 回去还会拉起来）。临时扩开看完，记得改回原来的数量。

```bash
kubectl -n <ns> scale deploy <deploy> --replicas=<n>
```

# 七、Service 和节点

`PORT(S)` 列如果显示成 `8848:30848` 两段（NodePort 类型才会这样），前一段是集群内部访问的端口，后一段是节点上对外开的端口。容器真正监听的端口不在这个列表里，要用下面的 `describe` 看 `TargetPort`。访问不通时，对一下这三段是不是串在同一个 Service 上：节点端口、Service 端口、容器里的 `TargetPort`。

```bash
kubectl get svc -n <ns> -o wide
```

`describe` 比上一行更全，能看到选择器，以及当前有没有 Endpoints（没有任何 Pod 被选中时，外面访问会失败）。

```bash
kubectl -n <ns> describe svc <svc>
```

Pod 停在 `Pending`、Events 里写资源不够时，看这台机器的 CPU 和内存还剩多少。`<node>` 换成 `kubectl get node` 列出来的节点名。

```bash
kubectl describe node <node>
```

# 八、使用时注意

Pod 名带一串随机后缀，重建后就不能再用。看日志、改副本，优先写 `deploy/<deploy>`。按标签找 Pod 是另一条命令，用 `-l app=<app>`。

`kubectl logs` 只能看到还在的容器打到标准输出的内容。Pod 删掉之后，这段输出基本拿不回来。

尖括号是文章里的记号。复制后把 `<ns>` 这类整段换成真实名字，不要留着括号执行。

# 小结

先 `get pods`、`get deploy` 确认名字和命名空间，再查配置、事件和日志。日志优先 `--tail`，要盯着新输出再用 `-f`。

# 参考资料

- [1] [kubectl 速查](https://kubernetes.io/docs/reference/kubectl/quick-reference/)
- [2] [kubectl logs](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/)
