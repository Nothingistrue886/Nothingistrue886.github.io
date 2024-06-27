---
layout: post
title: Spring事务传播机制
categories: [Java, Spring]
description: spring事务传播机制
keywords: Spring
---

Spring 事务传播机制是指，包含多个事务的方法在相互调用时，事务是如何在这些方法间传播的。

既然是“事务传播”，所以事务的数量应该在两个或两个以上，Spring 事务传播机制的诞生是为了规定多个事务在传播过程中的行为的。比如方法 A 开启了事务，而在执行过程中又调用了开启事务的 B 方法，那么 B 方法的事务是应该加入到 A 事务当中呢？还是两个事务相互执行互不影响，又或者是将 B 事务嵌套到 A 事务中执行呢？所以这个时候就需要一个机制来规定和约束这两个事务的行为，这就是 Spring 事务传播机制所解决的问题。

## Spring 事务传播机制有哪些？

Spring 事务传播机制可使用 @Transactional(propagation=Propagation.REQUIRED) 来定义，Spring 事务传播机制的级别包含以下 7 种：

1. Propagation.REQUIRED：默认的事务传播级别，它表示如果当前存在事务，则加入该事务；如果当前没有事务，则创建一个新的事务。
2. Propagation.SUPPORTS：如果当前存在事务，则加入该事务；如果当前没有事务，则以非事务的方式继续运行。
3. Propagation.MANDATORY：（mandatory：强制性）如果当前存在事务，则加入该事务；如果当前没有事务，则抛出异常。
4. Propagation.REQUIRES_NEW：表示创建一个新的事务，如果当前存在事务，则把当前事务挂起。也就是说不管外部方法是否开启事务，Propagation.REQUIRES_NEW 修饰的内部方法会新开启自己的事务，且开启的事务相互独立，互不干扰。
5. Propagation.NOT_SUPPORTED：以非事务方式运行，如果当前存在事务，则把当前事务挂起。
6. Propagation.NEVER：以非事务方式运行，如果当前存在事务，则抛出异常。
7. Propagation.NESTED：如果当前存在事务，则创建一个事务作为当前事务的嵌套事务来运行；如果当前没有事务，则该取值等价于 PROPAGATION_REQUIRED。

以上 7 种传播机制，可根据“是否支持当前事务”的维度分为以下 3 类：
![Nginx 502 Bad Gateway]({{ site.url }}/images{{ page.url }}/事务传播1.png) 
看到这里，有人可能会说：说了这么多，我也看不懂啊，即使看懂了，我也记不住啊？这要咋整？

没关系，接下来我们用一个例子，来说明这 3 类事务传播机制的区别。

以情侣之间是否要买房为例，我们将以上 3 类事务传播机制可以看作是恋爱中的 3 类女生类型：

- 普通型
- 强势型
- 懂事型

这三类女生如下图所示：
![Nginx 502 Bad Gateway]({{ site.url }}/images{{ page.url }}/事务传播2.png) 
支持当前事务的“女生”，这里的事务指的是“房子”，它分为 3 种（普通型女生）：

- Propagation.REQUIRED（需要有房子）：有房子了咱们一起住，没房子了咱们一起赚钱买房子。
- Propagation.SUPPORTS（可以有房子）：有房子了就一起住，没房子了咱们就一起租房子。
- Propagation.MANDATORY（强制有房子）：有房子了就一起住，没房子了就分手。

不支持当前事务的“女生”也分为 3 种（强势型或者叫事业型）：

- Propagation.REQUIRES_NEW：不要你的房子，必须一起赚钱买房子。
- Propagation.NOT_SUPPORTED：不要你的房子，必须一起租房子。
- Propagation.NEVER：必须一起租房子，你有房子就分手。

最后一种是嵌套性事务 Propagation.NESTED，它属于懂事型女友，如果有房子了就以房子为基础做点小生意，卖个花生、水果啥的，如果买卖成了，那就继续发展；如果失败了，至少还有房子；如果没房子也没关系，一起赚钱买房子。
