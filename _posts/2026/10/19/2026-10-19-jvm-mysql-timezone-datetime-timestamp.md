---
layout: post
title: JVM、MySQL 和两种时间类型：为什么「同一时刻」对不上
slug: jvm-mysql-timezone-datetime-timestamp
categories: [Java, MySQL]
description: JVM 默认时区、MySQL 会话时区和 TIMESTAMP/DATETIME 叠在一起，同一条记录上的时间会对不上
keywords: TimeZone, LocalDateTime, MySQL, TIMESTAMP, DATETIME
---

同一行数据里，上游给的 Unix 秒换算成北京时间是对的，`created_at` 却像少了 8 小时。SQL 没有写反。JVM 默认时区、MySQL 会话时区、列类型（`TIMESTAMP` / `DATETIME`）各算各的，再拿去切统计窗口，就会整段错位。

# 一、现象

对话记录写入 `demo_chat_record`：

- `timestamp_value`：上游传来的 Unix 秒；
- `event_time_utc`：打算存事件的 UTC 时间；
- `created_at`：入库时间，Java 里用 `LocalDateTime.now()` 写。

对账时，`timestamp_value` 换成北京时间没问题，`created_at` 看起来是 UTC。报表按 `created_at` 切「今天」，会少掉一截。库里 `SELECT NOW()` 和笔记本上的北京时间也不一样。

# 二、三个「现在」

```
上游 epoch 秒
    │  绝对时间，和 JVM、MySQL 无关
    │  换算时用了哪个 ZoneId？
    ▼
LocalDateTime.now()
    │  JVM 默认时区下的墙钟，值本身不带偏移
    │  容器是 UTC、IDE 是上海，写进去就差 8 小时
    ▼
NOW() / 列类型
    TIMESTAMP  内部按 UTC 存，展示跟着 session time_zone 变
    DATETIME   存写进去的字面量，一般不换算
```

## 1. `LocalDateTime.now()`

它取的是 JVM 默认时区下的本地日期时间，不带时区偏移。要记绝对时刻，用 `Instant.now()` 或 `ZonedDateTime`，入库前定好用哪个 `ZoneId`：存 UTC 字面量，还是存上海墙钟。

## 2. `NOW()` 看会话时区

`NOW()` / `CURRENT_TIMESTAMP` 受 session `time_zone` 影响，碰到 `TIMESTAMP` 更明显。连接池没统一 `connectionInitSql`（`SET time_zone = '+00:00'` 或 `'Asia/Shanghai'`）时，应用和手工连库看到的「现在」会不一样。命名时区要先导入 MySQL 时区表；写成 `'+08:00'` 则不用。

```sql
SELECT @@session.time_zone, @@global.time_zone, NOW(), UTC_TIMESTAMP();
```

## 3. `TIMESTAMP` 和 `DATETIME`

| 类型 | MySQL 8 里大致是这样 |
|------|----------------------|
| **TIMESTAMP** | 内部按 UTC 存；读写随 session `time_zone` 转换 |
| **DATETIME** | 存写进去的字面量；一般不随时区换算 |

「北京时间 2026-10-19 15:00:00」写进 `DATETIME`，库里就是这串字。写进 `TIMESTAMP`，还要看当前会话把这串字理解成哪个时区。两种列混着用，再映射到 Java，对账会对乱。

## 4. 用错尺子切窗口

调度按 `LocalDateTime.now()` 算「今天 0 点到 24 点」，清理按 `UTC_TIMESTAMP()` 算水位，同一批数据会落进不同的窗口：提前跑，或者漏删、多删。两边的「今天」不是同一个。

# 三、错误写法

```java
// 容器 JVM 默认 UTC，本机 IDE 是上海，写出来的 created_at 不一样
entity.setCreatedAt(LocalDateTime.now());

// 列名叫 event_time_utc，换算却用了系统默认时区
entity.setEventTimeUtc(
    Instant.ofEpochSecond(ts)
        .atZone(ZoneId.systemDefault())
        .toLocalDateTime()
);
```

```sql
CREATE TABLE demo_chat_record (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  timestamp_value  BIGINT NOT NULL COMMENT '上游 Unix 秒',
  event_time_utc   DATETIME NOT NULL COMMENT '列名写 UTC，实际可能是 JVM 本地时间',
  created_at       DATETIME NOT NULL
);

-- 按 created_at 切「今天」，跟着会话时区走
SELECT * FROM demo_chat_record
 WHERE created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY;

-- 下面这条才是按 UTC 日界切 epoch
-- 别写成 UNIX_TIMESTAMP(UTC_DATE())：UTC_DATE() 没有时区，UNIX_TIMESTAMP 会按会话时区解释
SELECT * FROM demo_chat_record
 WHERE timestamp_value >= (UNIX_TIMESTAMP(UTC_TIMESTAMP()) DIV 86400) * 86400
   AND timestamp_value <  (UNIX_TIMESTAMP(UTC_TIMESTAMP()) DIV 86400 + 1) * 86400;
```

# 四、约定

字段名或注释里写清它是哪一种时间：

| 语义 | 怎么存 | 示例列名 |
|------|--------|----------|
| 业务事件发生时刻 | Unix 秒/毫秒；或全员按同一规则解释的 UTC `DATETIME` / `TIMESTAMP` | `timestamp_value`、`event_time_utc` |
| 行是什么时候写入的 | 全链路 UTC，或全链路 `Asia/Shanghai`，只选一种 | `created_at` |
| 调度、清理扫到哪里 | 和事件时间用同一把尺子 | `processed_until_utc` |

审计时间可以存 UTC 字面量，也可以直接存 epoch 毫秒，展示时再格式化：

```java
LocalDateTime createdAtUtc = LocalDateTime.ofInstant(
    Instant.now(), ZoneOffset.UTC);

long createdAtEpochMs = Instant.now().toEpochMilli();
```

连接上库就固定会话时区，所有实例用同一个值：

```yaml
spring:
  datasource:
    hikari:
      connection-init-sql: "SET time_zone = '+00:00'"
```

审计字段如果约定存上海墙钟，JVM 也要指到上海。只改容器 `TZ`、不改 MySQL session、不改列的含义，三边还是对不齐。

```dockerfile
ENV TZ=Asia/Shanghai
```

epoch 换算时把 `ZoneId` 写死，不要用 `ZoneId.systemDefault()`：

```java
Instant eventInstant = Instant.ofEpochSecond(timestampValue);
ZonedDateTime shanghai = eventInstant.atZone(ZoneId.of("Asia/Shanghai"));
LocalDateTime eventUtc = LocalDateTime.ofInstant(eventInstant, ZoneOffset.UTC);
```

# 五、小结

差 8 小时时，先对一下这三样：JVM 默认时区、`@@session.time_zone`、这一列是 `TIMESTAMP` 还是 `DATETIME`。`UTC_TIMESTAMP()` 和样本行放在一起看，比先改业务代码快。

事件时刻用 epoch 或明确的 UTC；`created_at` 和清理水位各认一种时区，写进字段名里。窗口 SQL 不要混用 `CURDATE()` 和 epoch 日界。

# 参考资料

- [1] [MySQL 8.0 Reference Manual — The DATE, DATETIME, and TIMESTAMP Types](https://dev.mysql.com/doc/refman/8.0/en/datetime.html)
- [2] [MySQL 8.0 Reference Manual — Time Zone Support](https://dev.mysql.com/doc/refman/8.0/en/time-zone-support.html)
- [3] Oracle Java Docs — [`Instant`](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/Instant.html)、[`ZoneId`](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/time/ZoneId.html)
