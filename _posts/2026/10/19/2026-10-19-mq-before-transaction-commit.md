---
layout: post
title: 事务还没提交，消息已经发出去了
slug: mq-before-transaction-commit
categories: [Java, Spring]
description: 事务提交前发送 MQ，消费者按主键查库会偶发查不到；先把发送挪到提交之后，丢消息再用状态字段加定时补发
keywords: Spring, Transaction, MQ, afterCommit
---

库存服务拿到「订单已创建」的消息，按 `orderId` 去查库，有时查不到，过一会儿重试又有了。消息没有丢，是发送发生在事务提交之前。消费者用的是别的数据库连接，只能看见已经提交的行。

# 一、现象

订单服务创建订单后，要通知库存扣减预留。顺序写成了这样：

1. 向 `demo_order` 插入一行；
2. 马上发送 `OrderCreated`；
3. 库存服务用 `orderId` 查订单详情。

日志是 `order not found`，重试几次就消失。第一反应容易是消费者太快，多半是发消息的时刻早于 `commit`。

# 二、根因

Spring 声明式事务在代理方法正常返回之后才提交。方法体里面的 `kafkaTemplate.send(...)` 还在同一个事务里。

```
OrderService.createOrder() 开始
     |
     |-- INSERT demo_order     （未提交，其他连接看不到）
     |
     |-- send(OrderCreated)    （消息已经进 Broker，消费者可能立刻跑）
     |
     |-- 方法返回 --> commit    （这时订单才对其他会话可见）
```

`READ COMMITTED` 下，其他连接读不到未提交行。MySQL 默认的 `REPEATABLE READ` 也一样。

这和 [Spring事务失效]({{ site.url }}/2024/04/01/Spring-transaction-failure/) 不是同一类问题。那边常见的是 private 方法、自调用，事务根本没开起来。这里事务是开着的，只是发消息放早了。

# 三、错误写法

```java
@Service
public class OrderService {

    private final OrderRepository orderRepository;
    private final InventoryEventPublisher eventPublisher;

    @Transactional(rollbackFor = Exception.class)
    public Long createOrder(CreateOrderCommand cmd) {
        DemoOrder order = orderRepository.save(toEntity(cmd));
        // INSERT 还没提交，消息可能已经被消费
        eventPublisher.publishOrderCreated(order.getId());
        return order.getId();
    }
}
```

```java
@Component
public class InventoryListener {

    @KafkaListener(topics = "demo.order.created")
    public void onOrderCreated(OrderCreatedEvent event) {
        DemoOrder order = orderRepository.findById(event.getOrderId())
            .orElseThrow(() -> new NotFoundException("order"));
        reserveStock(order);
    }
}
```

消费者里睡 100ms，或者失败就盲加重试，只是在赌提交什么时候完成。

# 四、改法

## 1. 提交成功后再发

用 `TransactionSynchronizationManager.registerSynchronization`，把发送放进 `afterCommit`：

```java
@Service
public class OrderService {

    @Transactional(rollbackFor = Exception.class)
    public Long createOrder(CreateOrderCommand cmd) {
        DemoOrder order = orderRepository.save(toEntity(cmd));
        Long orderId = order.getId();

        TransactionSynchronizationManager.registerSynchronization(
            new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    eventPublisher.publishOrderCreated(orderId);
                }
            }
        );
        return orderId;
    }
}
```

事务内 `applicationEventPublisher.publishEvent(...)`，监听方法标 `@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)`，也是提交成功后才回调。

单库、读的又是主库时，消费者过来查，订单行已经可见。手动事务也行：`commit` 返回之后再 `send`。

它盖不住这几件事：

| 窗口 | 结果 |
|------|------|
| 提交后、发送前进程挂了 | 库里有订单，消息没出去 |
| 发送失败，没有重试 | 同上 |
| 消费者读从库 | 复制延迟期间仍可能查不到 |

## 2. 待发送状态，加定时补发

独立的 Outbox 表我不会先建。订单上加一列 `notify_status`，或者单独一张待办表，和订单写在同一个事务里，状态先写成待发送。`afterCommit` 里发送，成功再改成已发送。定时任务扫还停在待发送的行，补发一次。消费端按订单做幂等。

```sql
-- 状态挂在业务表上
ALTER TABLE demo_order ADD COLUMN notify_status TINYINT NOT NULL DEFAULT 0;
-- 0 待通知  1 已通知

-- 或者单独一张待办，仍然是业务表，不是通用消息表
CREATE TABLE demo_dispatch_task (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  biz_type    VARCHAR(32) NOT NULL,
  biz_id      BIGINT NOT NULL,
  status      TINYINT NOT NULL,       -- 0 待发送 1 已发送 2 失败待重试
  retry_count INT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL,
  sent_at     DATETIME NULL,
  UNIQUE KEY uk_biz (biz_type, biz_id)
);
```

```java
@Transactional(rollbackFor = Exception.class)
public Long createOrder(CreateOrderCommand cmd) {
    DemoOrder order = toEntity(cmd);
    order.setNotifyStatus(NotifyStatus.PENDING);
    orderRepository.save(order);

    Long orderId = order.getId();
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                trySendAndMarkSent(orderId);
            }
        }
    );
    return orderId;
}

// SELECT ... WHERE notify_status = PENDING AND created_at < ?
public void retryPendingNotifications() {
    for (Long orderId : orderRepository.findPendingNotify()) {
        trySendAndMarkSent(orderId);
    }
}
```

`afterCommit` 回调里如果再去把状态改成 `SENT`，这次写库可能还挂在原来的事务资源上，后面不会再有一次提交。这种更新用 `PROPAGATION_REQUIRES_NEW`，或者走一条新连接。

下游是 ES、向量库时，常见的是 `sync_status` 加扫库补偿。那是副本没跟上，和这里的提交顺序是两件事，两套状态不要塞进同一张表。

## 3. 独立 Outbox

Transactional Outbox 是同一个事务里写业务数据和 `demo_outbox`，另外一个投递进程再去发 MQ。事件种类多、还要统一投递和监控时再考虑。手头已经有任务表，状态能表达「待发送」，用任务表就够。

```java
@Transactional(rollbackFor = Exception.class)
public Long createOrder(CreateOrderCommand cmd) {
    DemoOrder order = orderRepository.save(toEntity(cmd));
    outboxRepository.insertPending("OrderCreated", order.getId());
    return order.getId();
}
```

## 4. 只扫业务数据做补偿

不加字段也可以。定时找出创建超过 N 分钟、库存侧还没有预留记录的订单，补发消息或者直接调接口。量不大、规则清楚时能兜住；核对起来不如显式的待发送 / 已发送。

# 五、小结

查不到，先把发送挪到提交之后：`afterCommit`，或者手动 `commit` 成功再发。

提交之后进程挂了、发送失败，用待发送状态加定时补发。独立 Outbox 表可以以后再加。

事务有没有真正开起来，去看失效那一篇；这边只处理「事务开了，消息发早了」。

# 参考资料

- [1] [Spring Framework Javadoc — TransactionSynchronization](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/support/TransactionSynchronization.html)（`afterCommit` 的语义，以及回调里写库要用 `PROPAGATION_REQUIRES_NEW`）
- [2] Chris Richardson — [Pattern: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- [3] [Spring Framework Javadoc — TransactionalEventListener](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/event/TransactionalEventListener.html)（默认就是 `AFTER_COMMIT`）
