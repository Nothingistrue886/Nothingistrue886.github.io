---
layout: post
title: Java线程池的实现原理
categories: [Java, Java SE]
description: 线程池
keywords: Thread pool, 线程池
---

随着计算机行业的飞速发展，摩尔定律逐渐失效，多核CPU成为主流。使用多线程并行计算逐渐成为开发人员提升服务器性能的基本武器。J.U.C提供的线程池：ThreadPoolExecutor类，帮助开发人员管理线程并方便地执行并行任务。了解并合理使用线程池，是一个开发人员必修的基本功。 

# 线程池是什么

线程池（Thread Pool）是一种基于池化思想管理线程的工具，经常出现在多线程服务器中，如MySQL。

线程过多会带来额外的开销，其中包括创建销毁线程的开销、调度线程的开销等等，同时也降低了计算机的整体性能。线程池维护多个线程，等待监督管理者分配可并发执行的任务。这种做法，一方面避免了处理任务时创建销毁线程开销的代价，另一方面避免了线程数量膨胀导致的过分调度问题，保证了对内核的充分利用。

而本文描述线程池是JDK中提供的ThreadPoolExecutor类。

当然，使用线程池可以带来一系列好处：

- **降低资源消耗**：通过池化技术重复利用已创建的线程，降低线程创建和销毁造成的损耗。
- **提高响应速度**：任务到达时，无需等待线程创建即可立即执行。
- **提高线程的可管理性**：线程是稀缺资源，如果无限制创建，不仅会消耗系统资源，还会因为线程的不合理分布导致资源调度失衡，降低系统的稳定性。使用线程池可以进行统一的分配、调优和监控。
- **提供更多更强大的功能**：线程池具备可拓展性，允许开发人员向其中增加更多的功能。比如延时定时线程池ScheduledThreadPoolExecutor，就允许任务延期执行或定期执行。

# 线程池解决了什么问题

线程池解决的核心问题就是资源管理问题。在并发环境下，系统不能够确定在任意时刻中，有多少任务需要执行，有多少资源需要投入。这种不确定性将带来以下若干问题：

1. 频繁申请/销毁资源和调度资源，将带来额外的消耗，可能会非常巨大。
2. 对资源无限申请缺少抑制手段，易引发系统资源耗尽的风险。
3. 系统无法合理管理内部的资源分布，会降低系统的稳定性。

为解决资源分配这个问题，线程池采用了`池化`（Pooling）思想。池化，顾名思义，是为了最大化收益并最小化风险，而将资源统一在一起管理的一种思想。

> Pooling is the grouping together of resources (assets, equipment, personnel, effort, etc.) for the purposes of maximizing advantage or minimizing risk to the users. The term is used in finance, computing and equipment management.——wikipedia

"池化"思想不仅仅能应用在计算机领域，在金融、设备、人员管理、工作管理等领域也有相关的应用。

在计算机领域中的表现为：统一管理IT资源，包括服务器、存储、和网络资源等等。通过共享资源，使用户在低投入中获益。除去线程池，还有其他比较典型的几种使用策略包括：

1. 内存池(Memory Pooling)：预先申请内存，提升申请内存速度，减少内存碎片。
2. 连接池(Connection Pooling)：预先申请数据库连接，提升申请连接的速度，降低系统的开销。
3. 实例池(Object Pooling)：循环使用对象，减少资源在初始化和释放时的昂贵损耗。

在了解完“是什么”和“为什么”之后，下面我们来一起深入一下线程池的内部实现原理。 

# 线程池的实现原理

Java中的线程池核心实现类是ThreadPoolExecutor，本章基于JDK 1.8的源码来分析Java线程池的核心设计与实现。我们首先来看一下ThreadPoolExecutor的UML类图，了解下ThreadPoolExecutor的继承关系。 

![ThreadPoolExecutor UML类图]({{ site.url }}/images{{ page.url }}/uml.png) 

ThreadPoolExecutor实现的顶层接口是Executor，顶层接口Executor提供了一种思想：将任务提交和任务执行进行解耦。用户无需关注如何创建线程，如何调度线程来执行任务，用户只需提供Runnable对象，将任务的运行逻辑提交到执行器(Executor)中，由Executor框架完成线程的调配和任务的执行部分。

ExecutorService接口增加了一些能力：（1）扩充执行任务的能力，补充可以为一个或一批异步任务生成Future的方法；（2）提供了管控线程池的方法，比如停止线程池的运行。

AbstractExecutorService则是上层的抽象类，将执行任务的流程串联了起来，保证下层的实现只需关注一个执行任务的方法即可。

最下层的实现类ThreadPoolExecutor实现最复杂的运行部分，ThreadPoolExecutor将会一方面维护自身的生命周期，另一方面同时管理线程和任务，使两者良好的结合从而执行并行任务。 

ThreadPoolExecutor是如何运行，如何同时维护线程和执行任务的呢？其运行机制如下图所示： 

![ThreadPoolExecutor运行流程图]({{ site.url }}/images{{ page.url }}/execute.png) 

线程池在内部实际上构建了一个生产者消费者模型，将线程和任务两者解耦，并不直接关联，从而良好的缓冲任务，复用线程。线程池的运行主要分成两部分：任务管理、线程管理。任务管理部分充当生产者的角色，当任务提交后，线程池会判断该任务后续的流转：（1）直接申请线程执行该任务；（2）缓冲到队列中等待线程执行；（3）拒绝该任务。线程管理部分是消费者，它们被统一维护在线程池内，根据任务请求进行线程的分配，当线程执行完任务后则会继续获取新的任务去执行，最终当线程获取不到任务的时候，线程就会被回收。

接下来，我们会按照以下三个部分去详细讲解线程池运行机制：

1. 线程池如何维护自身状态。
2. 线程池如何管理任务。
3. 线程池如何管理线程。

# 1.生命周期管理

线程池运行的状态，并不是用户显式设置的，而是伴随着线程池的运行，由内部来维护。线程池内部使用一个变量维护两个值：运行状态(runState)和线程数量 (workerCount)。在具体实现中，线程池将运行状态(runState)、线程数量 (workerCount)两个关键参数的维护放在了一起，如下代码所示： 

ThreadPoolExecutor继承自AbstractExecutorService，也是实现了ExecutorService接口。

```java
public class ThreadPoolExecutor extends AbstractExecutorService {
    private final AtomicInteger ctl = new AtomicInteger(ctlOf(RUNNING, 0));
    private static final int COUNT_BITS = Integer.SIZE - 3;
    private static final int CAPACITY   = (1 << COUNT_BITS) - 1;

    // runState is stored in the high-order bits
    private static final int RUNNING    = -1 << COUNT_BITS;
    private static final int SHUTDOWN   =  0 << COUNT_BITS;
    private static final int STOP       =  1 << COUNT_BITS;
    private static final int TIDYING    =  2 << COUNT_BITS;
    private static final int TERMINATED =  3 << COUNT_BITS;
}
```

`ctl`这个AtomicInteger类型，是对线程池的运行状态和线程池中有效线程的数量进行控制的一个字段， 它同时包含两部分的信息：线程池的运行状态 (runState) 和线程池内有效线程的数量 (workerCount)，高3位保存runState，低29位保存workerCount，两个变量之间互不干扰。COUNT_BITS 就是29，CAPACITY就是1左移29位减1（29个1），这个常量表示workerCount的上限值，大约是5亿。用一个变量去存储两个值，可避免在做相关决策时，出现不一致的情况，不必为了维护两者的一致，而占用锁资源。通过阅读线程池源代码也可以发现，经常出现要同时判断线程池运行状态和线程数量的情况。线程池也提供了若干方法去供用户获得线程池当前的运行状态、线程个数。这里都使用的是位运算的方式，相比于基本运算，速度也会快很多。 

关于内部封装的获取生命周期状态、获取线程池线程数量的计算方法如以下代码所示： 

```java
// Packing and unpacking ctl
private static int runStateOf(int c)     { return c & ~CAPACITY; }	// 计算当前运行状态
private static int workerCountOf(int c)  { return c & CAPACITY; }	// 计算当前活动线程数
private static int ctlOf(int rs, int wc) { return rs | wc; }		// 通过状态和线程数生成ctl
```

下面再介绍下**线程池的运行状态**. 线程池一共有五种状态, 分别是:

1. **RUNNING** ：能接受新提交的任务，并且也能处理阻塞队列中的任务；

2. **SHUTDOWN**：关闭状态，不再接受新提交的任务，但却可以继续处理阻塞队列中已保存的任务。在线程池处于 RUNNING 状态时，调用 shutdown()方法会使线程池进入到该状态。（finalize() 方法在执行过程中也会调用shutdown()方法进入该状态）；

3. **STOP**：不能接受新任务，也不处理队列中的任务，会中断正在处理任务的线程。在线程池处于 RUNNING 或 SHUTDOWN 状态时，调用 shutdownNow() 方法会使线程池进入到该状态；

4. **TIDYING**：如果所有的任务都已终止了，workerCount (有效线程数) 为0，线程池进入该状态后会调用 terminated() 方法进入TERMINATED 状态。

5. **TERMINATED**：在terminated() 方法执行完后进入该状态，默认terminated()方法中什么也没有做。

   进入TERMINATED的条件如下：

   - 线程池不是RUNNING状态；
   - 线程池状态不是TIDYING状态或TERMINATED状态；
   - 如果线程池状态是SHUTDOWN并且workerQueue为空；
   - workerCount为0；
   - 设置TIDYING状态成功。

下图为线程池的状态转换过程：

![线程池状态转换]({{ site.url }}/images{{ page.url }}/Lifecycle.png) 

# 2.任务执行机制

首先，了解一下ThreadPoolExecutor的构造方法：

```java
// 有参构造。无论调用哪个有参构造，最终都会执行当前的有参构造
public ThreadPoolExecutor(int corePoolSize,
                          int maximumPoolSize,
                          long keepAliveTime,
                          TimeUnit unit,
                          BlockingQueue<Runnable> workQueue,
                          ThreadFactory threadFactory,
                          RejectedExecutionHandler handler) {
    // 健壮性校验
    // 核心线程个数是允许为0个的。
    // 最大线程数必须大于0，最大线程数要大于等于核心线程数
    // 非核心线程的最大空闲时间，可以等于0
    if (corePoolSize < 0 ||
        maximumPoolSize <= 0 ||
        maximumPoolSize < corePoolSize ||
        keepAliveTime < 0)
        // 不满足要求就抛出参数异常
        throw new IllegalArgumentException();
    // 阻塞队列，线程工厂，拒绝策略都不允许为null，为null就扔空指针异常
    if (workQueue == null || threadFactory == null || handler == null)
        throw new NullPointerException();
    // 不要关注当前内容，系统资源访问决策，和线程池核心业务关系不大。
    this.acc = System.getSecurityManager() == null ? null : AccessController.getContext();
    // 各种赋值，JUC包下，几乎所有涉及到线程挂起的操作，单位都用纳秒。
    // 有参构造的值，都赋值给成员变量。
    // Doug Lea的习惯就是将成员变量作为局部变量单独操作。
    this.corePoolSize = corePoolSize;
    this.maximumPoolSize = maximumPoolSize;
    this.workQueue = workQueue;
    this.keepAliveTime = unit.toNanos(keepAliveTime);
    this.threadFactory = threadFactory;
    this.handler = handler;
}
```

构造方法中的字段含义如下：

- **corePoolSize**：核心线程数量（当前任务执行结束后，不会被销毁）;
- **maximumPoolSize**：最大线程数量（代表当前线程池中，一共可以有多少个工作线程）；
- **workQueue**：阻塞队列，当任务提交时，如果线程池中的线程数量大于等于corePoolSize的时候，把该任务封装成一个Worker对象放入等待队列；
- **keepAliveTime**：表示线程池中线程允许的空闲时间。当线程池中的线程数量大于corePoolSize的时候，如果这时没有新的任务提交，核心线程外的线程不会立即销毁，而是会等待，直到等待的时间超过了keepAliveTime；
- **TimeUnit**：表示时间单位，keepAliveTime的时间单位通常是TimeUnit.SECONDS。
- **threadFactory**：它是ThreadFactory类型的变量，用来创建新线程。默认使用Executors.defaultThreadFactory() 来创建线程。使用默认的ThreadFactory来创建线程时，会使新创建的线程具有相同的NORM_PRIORITY优先级并且是非守护线程，同时也设置了线程的名称。
- **handler**：它是RejectedExecutionHandler类型的变量，表示线程池的饱和策略。当队列和线程池都满了，说明线程池处于饱和状态。这时如果继续提交任务，就需要采取一种策略处理该任务。

## 2.1任务调度 

任务调度是线程池的主要入口，当用户提交了一个任务，接下来这个任务将如何执行都是由这个阶段决定的。了解这部分就相当于了解了线程池的核心运行机制。 

所有任务的调度都是由execute方法完成的，这部分完成的工作是：检查现在线程池的运行状态、运行线程数、运行策略，决定接下来执行的流程，是直接申请线程执行，或是缓冲到队列中执行，亦或是直接拒绝该任务。

### ThreadPoolExecutor的execute方法

```java
// 提交任务到线程池的核心方法
// command就是提交过来的任务
public void execute(Runnable command) {
    // 提交的任务不能为null
    if (command == null)
        throw new NullPointerException();
    // 获取核心属性ctl，用于后面的判断
    int c = ctl.get();
    // 如果工作线程个数，小于核心线程数。
    // 满足要求，添加核心工作线程
    if (workerCountOf(c) < corePoolSize) {
        // addWorker(任务,是核心线程吗)
        // addWorker返回true：代表添加工作线程成功
        // addWorker返回false：代表添加工作线程失败
        // addWorker中会基于线程池状态，以及工作线程个数做判断，查看能否添加工作线程
        if (addWorker(command, true))
            // 工作线程构建出来了，任务也交给command去处理了。
            return;
        // 说明线程池状态或者是工作线程个数发生了变化，导致添加失败，重新获取一次ctl
        c = ctl.get();
    }
    // 添加核心工作线程失败，往这走
    // 判断线程池状态是否是RUNNING，如果是，正常基于阻塞队列的offer方法，将任务添加到阻塞队列
    if (isRunning(c) && workQueue.offer(command)) {
        // 如果任务添加到阻塞队列成功，走if内部
        // 如果任务在扔到阻塞队列之前，线程池状态突然改变了。
        // 重新获取ctl
        int recheck = ctl.get();
        // 如果线程池的状态不是RUNNING，将任务从阻塞队列移除，
        if (!isRunning(recheck) && remove(command))
            // 并且直接拒绝策略
            reject(command);
        // 在这，说明阻塞队列有我刚刚放进去的任务
        // 查看一下工作线程数是不是0个
        // 如果工作线程为0个，需要添加一个非核心工作线程去处理阻塞队列中的任务
        // 发生这种情况有两种：
        // 1. 构建线程池时，核心线程数是0个。
        // 2. 即便有核心线程，可以设置核心线程也允许超时，设置allowCoreThreadTimeOut为true，代表核心线程也可以超时
        else if (workerCountOf(recheck) == 0)
            // 为了避免阻塞队列中的任务饥饿，添加一个非核心工作线程去处理
            addWorker(null, false);
    }
    // 任务添加到阻塞队列失败
    // 构建一个非核心工作线程
    // 如果添加非核心工作线程成功，直接完事，告辞
    else if (!addWorker(command, false))
        // 添加失败，执行决绝策略
        reject(command);
}
```

简单来说，execute()方法的执行过程如下：

1. 首先检测线程池运行状态，如果不是`RUNNING`，则直接拒绝，线程池要保证在`RUNNING`的状态下执行任务。
2. 如果`workerCount < corePoolSize`，则创建并启动一个线程来执行新提交的任务，即使线程池中的其他线程是空闲的；
3. 如果`workerCount >= corePoolSize`，且线程池内的阻塞队列未满，则将任务添加到该阻塞队列中；
4. 如果`workerCount >= corePoolSize && workerCount < maximumPoolSize`，且线程池内的阻塞队列已满，则创建并启动一个线程来执行新提交的任务；
5. 如果`workerCount >= maximumPoolSize`，并且线程池内的阻塞队列已满, 则根据拒绝策略来处理该任务, 默认的处理方式是直接抛异常。

所以，任务提交时，判断的顺序为running -> corePoolSize –> workQueue –> maximumPoolSize。

其执行流程如下图所示： 

![线程池处理流程图]({{ site.url }}/images{{ page.url }}/process.png) 

## 2.2任务缓冲

任务缓冲模块是线程池能够管理任务的核心部分。线程池的本质是对任务和线程的管理，而做到这一点最关键的思想就是将任务和线程两者解耦，不让两者直接关联，才可以做后续的分配工作。线程池中是以生产者消费者模式，通过一个阻塞队列来实现的。阻塞队列缓存任务，工作线程从阻塞队列中获取任务。

阻塞队列(BlockingQueue)是一个支持两个附加操作的队列。这两个附加的操作是：在队列为空时，获取元素的线程会等待队列变为非空。当队列满时，存储元素的线程会等待队列可用。阻塞队列常用于生产者和消费者的场景，生产者是往队列里添加元素的线程，消费者是从队列里拿元素的线程。阻塞队列就是生产者存放元素的容器，而消费者也只从容器里拿元素。

下图中展示了线程1往阻塞队列中添加元素，而线程2从阻塞队列中移除元素：

![阻塞队列]({{ site.url }}/images{{ page.url }}/queue.png) 

使用不同的队列可以实现不一样的任务存取策略。在这里，我们可以再介绍下阻塞队列的成员： 

![阻塞队列2]({{ site.url }}/images{{ page.url }}/queue2.png) 

## 2.3任务申请

由上文的任务分配部分可知，任务的执行有两种可能：一种是任务直接由新创建的线程执行。另一种是线程从任务队列中获取任务然后执行，执行完任务的空闲线程会再次去从队列中申请任务再去执行。第一种情况仅出现在线程初始创建的时候，第二种是线程获取任务绝大多数的情况。

线程需要从任务缓存模块中不断地取任务执行，帮助线程从阻塞队列中获取任务，实现线程管理模块和任务管理模块之间的通信。这部分策略由getTask方法实现，其执行流程如下图所示：

![获取任务流程图]({{ site.url }}/images{{ page.url }}/apply.png) 

getTask这部分进行了多次判断，为的是控制线程的数量，使其符合线程池的状态。如果线程池现在不应该持有那么多线程，则会返回null值。工作线程Worker会不断接收新任务去执行，而当工作线程Worker接收不到任务的时候，就会开始被回收。 

## 2.4任务拒绝

任务拒绝模块是线程池的保护部分，线程池有一个最大的容量，当线程池的任务缓存队列已满，并且线程池中的线程数目达到maximumPoolSize时，就需要拒绝掉该任务，采取任务拒绝策略，保护线程池。

拒绝策略是一个接口，其设计如下：

```java
public interface RejectedExecutionHandler {
    void rejectedExecution(Runnable r, ThreadPoolExecutor executor);
}
```

用户可以通过实现这个接口去定制拒绝策略，也可以选择JDK提供的四种已有拒绝策略，其特点如下： 

![拒绝策略]({{ site.url }}/images{{ page.url }}/reject.png) 

# 3.Worker线程管理 

此小节引用自[Java线程池实现原理及其在美团业务中的实践](https://tech.meituan.com/2020/04/02/java-pooling-pratice-in-meituan.html)留作记录，以后需深入学习。

## 3.1Worker线程

 线程池为了掌握线程的状态并维护线程的生命周期，设计了线程池内的工作线程Worker。我们来看一下它的部分代码： 

```java
private final class Worker extends AbstractQueuedSynchronizer implements Runnable{
    final Thread thread;//Worker持有的线程
    Runnable firstTask;//初始化的任务，可以为null
}
```

Worker这个工作线程，实现了Runnable接口，并持有一个线程thread，一个初始化的任务firstTask。thread是在调用构造方法时通过ThreadFactory来创建的线程，可以用来执行任务；firstTask用它来保存传入的第一个任务，这个任务可以有也可以为null。如果这个值是非空的，那么线程就会在启动初期立即执行这个任务，也就对应核心线程创建时的情况；如果这个值是null，那么就需要创建一个线程去执行任务列表（workQueue）中的任务，也就是非核心线程的创建。

Worker执行任务的模型如下图所示：

![worker执行任务]({{ site.url }}/images{{ page.url }}/worker.png) 

线程池需要管理线程的生命周期，需要在线程长时间不运行的时候进行回收。线程池使用一张Hash表去持有线程的引用，这样可以通过添加引用、移除引用这样的操作来控制线程的生命周期。这个时候重要的就是如何判断线程是否在运行。

Worker是通过继承AQS，使用AQS来实现独占锁这个功能。没有使用可重入锁ReentrantLock，而是使用AQS，为的就是实现不可重入的特性去反应线程现在的执行状态。

1. lock方法一旦获取了独占锁，表示当前线程正在执行任务中。 
2. 如果正在执行任务，则不应该中断线程。 
3. 如果该线程现在不是独占锁的状态，也就是空闲的状态，说明它没有在处理任务，这时可以对该线程进行中断。 
4. 线程池在执行shutdown方法或tryTerminate方法时会调用interruptIdleWorkers方法来中断空闲的线程，interruptIdleWorkers方法会使用tryLock方法来判断线程池中的线程是否是空闲状态；如果线程是空闲状态则可以安全回收。

在线程回收过程中就使用到了这种特性，回收过程如下图所示：

![线程池回收过程]({{ site.url }}/images{{ page.url }}/recycle.png) 

## 3.2Worker线程增加

增加线程是通过线程池中的addWorker方法，该方法的功能就是增加一个线程，该方法不考虑线程池是在哪个阶段增加的该线程，这个分配线程的策略是在上个步骤完成的，该步骤仅仅完成增加线程，并使它运行，最后返回是否成功这个结果。addWorker方法有两个参数：firstTask、core。firstTask参数用于指定新增的线程执行的第一个任务，该参数可以为空；core参数为true表示在新增线程时会判断当前活动线程数是否少于corePoolSize，false表示新增线程前需要判断当前活动线程数是否少于maximumPoolSize，其执行流程如下图所示： 

![申请线程执行流程图]({{ site.url }}/images{{ page.url }}/addWorker.png) 

### ThreadPoolExecutor的addWorker方法

addWorker中主要分成两大块去看

* 第一块：校验线程池的状态以及工作线程个数
* 第二块：添加工作线程并且启动工作线程

校验线程池的状态以及工作线程个数

```java
// 添加工作线程之校验源码
private boolean addWorker(Runnable firstTask, boolean core) {
    // 外层for循环在校验线程池的状态
    // 内层for循环是在校验工作线程的个数

    // retry是给外层for循环添加一个标记，是为了方便在内层for循坏跳出外层for循环
    retry:
    for (;;) {
        // 获取ctl
        int c = ctl.get();
        // 拿到ctl的高3位的值
        int rs = runStateOf(c);
//==========================线程池状态判断==================================================
        // 如果线程池状态是SHUTDOWN，并且此时阻塞队列有任务，工作线程个数为0，添加一个工作线程去处理阻塞队列的任务

        // 判断线程池的状态是否大于等于SHUTDOWN，如果满足，说明线程池不是RUNNING
        if (rs >= SHUTDOWN &&
            // 如果这三个条件都满足，就代表是要添加非核心工作线程去处理阻塞队列任务
            // 如果三个条件有一个没满足，返回false，配合!，就代表不需要添加
            !(rs == SHUTDOWN && firstTask == null && ! workQueue.isEmpty()))
            // 不需要添加工作线程
            return false;

        for (;;) {
//==========================工作线程个数判断================================================== 
            // 基于ctl拿到低29位的值，代表当前工作线程个数   
            int wc = workerCountOf(c);
            // 如果工作线程个数大于最大值了，不可以添加了，返回false
            if (wc >= CAPACITY ||
                // 基于core来判断添加的是否是核心工作线程
                // 如果是核心：基于corePoolSize去判断
                // 如果是非核心：基于maximumPoolSize去判断
                wc >= (core ? corePoolSize : maximumPoolSize))
                // 代表不能添加，工作线程个数不满足要求
                return false;
            // 针对ctl进行 + 1，采用CAS的方式
            if (compareAndIncrementWorkerCount(c))
                // CAS成功后，直接退出外层循环，代表可以执行添加工作线程操作了。
                break retry;
            // 重新获取一次ctl的值
            c = ctl.get(); 
            // 判断重新获取到的ctl中，表示的线程池状态跟之前的是否有区别
            // 如果状态不一样，说明有变化，重新的去判断线程池状态
            if (runStateOf(c) != rs)
                // 跳出一次外层for循环
                continue retry;
        }
    }
    // 省略添加工作线程以及启动的过程
}
```

添加工作线程并且启动工作线程

```java
private boolean addWorker(Runnable firstTask, boolean core) {
    // 省略校验部分的代码

    // 添加工作线程以及启动工作线程~~~
    // 声明了三个变量
    // 工作线程启动了没，默认false
    boolean workerStarted = false;
    // 工作线程添加了没，默认false
    boolean workerAdded = false;
    // 工作线程，默认为null
    Worker w = null;

    try {
        // 构建工作线程，并且将任务传递进去
        w = new Worker(firstTask);
        // 获取了Worker中的Thread对象
        final Thread t = w.thread;
        // 判断Thread是否不为null，在new Worker时，内部会通过给予的ThreadFactory去构建Thread交给Worker
        // 一般如果为null，代表ThreadFactory有问题。
        if (t != null) {
            // 加锁，保证使用workers成员变量以及对largestPoolSize赋值时，保证线程安全
            final ReentrantLock mainLock = this.mainLock;
            mainLock.lock();
            try {
                // 再次获取线程池状态。
                int rs = runStateOf(ctl.get());
                // 再次判断
                // 如果满足  rs < SHUTDOWN  说明线程池是RUNNING，状态正常，执行if代码块
                // 如果线程池状态为SHUTDOWN，并且firstTask为null，添加非核心工作处理阻塞队列任务
                if (rs < SHUTDOWN ||
                    (rs == SHUTDOWN && firstTask == null)) {
                    // 到这，可以添加工作线程。
                    // 校验ThreadFactory构建线程后，不能自己启动线程，如果启动了，抛出异常
                    if (t.isAlive()) 
                        throw new IllegalThreadStateException();
                    // private final HashSet<Worker> workers = new HashSet<Worker>();
                    // 将new好的Worker添加到HashSet中。
                    workers.add(w);
                    // 获取了HashSet的size，拿到工作线程个数
                    int s = workers.size();
                    // largestPoolSize在记录最大线程个数的记录
                    // 如果当前工作线程个数，大于最大线程个数的记录，就赋值
                    if (s > largestPoolSize)
                        largestPoolSize = s;
                    // 添加工作线程成功
                    workerAdded = true;
                }
            } finally {
                mainLock.unlock();
            }
            // 如果工作线程添加成功，
            if (workerAdded) {
                // 直接启动Worker中的线程
                t.start();
                // 启动工作线程成功
                workerStarted = true;
            }
        }
    } finally {
        // 做补偿的操作，如果工作线程启动失败，将这个添加失败的工作线程处理掉
        if (!workerStarted)
            addWorkerFailed(w);
    }
    // 返回工作线程是否启动成功
    return workerStarted;
}
// 工作线程启动失败，需要不的步长操作
private void addWorkerFailed(Worker w) {
    // 因为操作了workers，需要加锁
    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        // 如果w不为null，之前Worker已经new出来了。
        if (w != null)
            // 从HashSet中移除
            workers.remove(w);
        // 同时对ctl进行 - 1，代表去掉了一个工作线程个数
        decrementWorkerCount();
        // 因为工作线程启动失败，判断一下状态的问题，是不是可以走TIDYING状态最终到TERMINATED状态了。
        tryTerminate();
    } finally {
        // 释放锁
        mainLock.unlock();
    }
}
```

## 3.3Worker线程回收

线程池中线程的销毁依赖JVM自动的回收，线程池做的工作是根据当前线程池的状态维护一定数量的线程引用，防止这部分线程被JVM回收，当线程池决定哪些线程需要回收时，只需要将其引用消除即可。Worker被创建出来后，就会不断地进行轮询，然后获取任务去执行，核心线程可以无限等待获取任务，非核心线程要限时获取任务。当Worker无法获取到任务，也就是获取的任务为空时，循环会结束，Worker会主动消除自身在线程池内的引用。

```java
try {
  while (task != null || (task = getTask()) != null) {
    //执行任务
  }
} finally {
  processWorkerExit(w, completedAbruptly);//获取不到任务时，主动回收自己
}
```

线程回收的工作是在processWorkerExit方法完成的。 

![线程销毁流程]({{ site.url }}/images{{ page.url }}/destroy.png) 

事实上，在这个方法中，将线程引用移出线程池就已经结束了线程销毁的部分。但由于引起线程销毁的可能性有很多，线程池还要判断是什么引发了这次销毁，是否要改变线程池的现阶段状态，是否要根据新状态，重新分配线程。 

## 3.4Worker线程执行任务

在Worker类中的run方法调用了runWorker方法来执行任务，runWorker方法的执行过程如下：

1. while循环不断地通过getTask()方法获取任务。 
2. getTask()方法从阻塞队列中取任务。 
3. 如果线程池正在停止，那么要保证当前线程是中断状态，否则要保证当前线程不是中断状态。
4. 执行任务。
5. 如果getTask结果为null则跳出循环，执行processWorkerExit()方法，销毁线程。

执行流程如下图所示：

![执行任务流程]({{ site.url }}/images{{ page.url }}/run.png) 

# 合理地配置线程池

有没有一种计算公式，能够让开发同学很简易地计算出某种场景中的线程池应该是什么参数呢？

带着这样的疑问，我们调研了业界的一些线程池参数配置方案：

![如何设置线程池参数]({{ site.url }}/images{{ page.url }}/param.png) 

调研了以上业界方案后，我们并没有得出通用的线程池计算方式。并发任务的执行情况和任务类型相关，IO密集型和CPU密集型的任务运行起来的情况差异非常大，但这种占比是较难合理预估的，这导致很难有一个简单有效的通用公式帮我们直接计算出结果。 

尽管经过谨慎的评估，仍然不能够保证一次计算出来合适的参数，那么我们是否可以将修改线程池参数的成本降下来，这样至少可以发生故障的时候可以快速调整从而缩短故障恢复的时间呢？基于这个思考，我们是否可以将线程池的参数从代码中迁移到分布式配置中心上，实现线程池参数可动态配置和即时生效，线程池参数动态化可以参考： [Java线程池实现原理及其在美团业务中的实践](https://tech.meituan.com/2020/04/02/java-pooling-pratice-in-meituan.html)

# 参考资料

- [1] JDK 1.8源码
- [2] [维基百科-线程池](https://zh.wikipedia.org/wiki/线程池)
- [3] [Java线程池实现原理及其在美团业务中的实践](https://tech.meituan.com/2020/04/02/java-pooling-pratice-in-meituan.html)
- [4] [深入理解Java线程池：ThreadPoolExecutor](http://www.ideabuffer.cn/2017/04/04/深入理解Java线程池：ThreadPoolExecutor/)
- [5]《Java并发编程实践》
- [6]《Java并发编程的艺术》