---
layout: post
title: Spring事务失效
categories: [Java, Spring]
description: spring事务失效
keywords: Spring
---

![Nginx 502 Bad Gateway]({{ site.url }}/images{{ page.url }}/事务失效.png) 

# 一、事务不生效

## 1.访问权限问题

众所周知，java 的访问权限主要有四种：private、default、protected、public，它们的权限从左到右，依次变大。

但如果我们在开发过程中，把某些事务方法，定义了错误的访问权限，就会导致事务功能出问题，例如：

```java
@Service
public class UserService {
    
    @Transactional
    private void add(UserModel userModel) {
         saveData(userModel);
         updateData(userModel);
    }
}
```

我们可以看到 add 方法的访问权限被定义成了private，这样会导致事务失效，spring 要求被代理方法必须是public的。

说白了，在AbstractFallbackTransactionAttributeSource类的computeTransactionAttribute方法中有个判断，如果目标方法不是 public，则TransactionAttribute返回 null，即不支持事务。

```java
protected TransactionAttribute computeTransactionAttribute(Method method, @Nullable Class<?> targetClass) {
    // Don't allow no-public methods as required.
    if (allowPublicMethodsOnly() && !Modifier.isPublic(method.getModifiers())) {
      return null;
    }
 	...
    return null;
  }
```

也就是说，如果我们自定义的事务方法（即目标方法），它的访问权限不是`public`，而是 private、default 或 protected 的话，spring 则不会提供事务功能。 

## 2. 方法用 final 修饰 

有时候，某个方法不想被子类重写，这时可以将该方法定义成 final 的。普通方法这样定义是没问题的，但如果将事务方法定义成 final，例如：

```java
@Service
public class UserService {
 
    @Transactional
    public final void add(UserModel userModel){
        saveData(userModel);
        updateData(userModel);
    }
}
```

我们可以看到 add 方法被定义成了final的，这样会导致事务失效。

为什么？

如果你看过 spring 事务的源码，可能会知道 spring 事务底层使用了 aop，也就是通过 jdk 动态代理或者 cglib，帮我们生成了代理类，在代理类中实现的事务功能。

但如果某个方法用 final 修饰了，那么在它的代理类中，就无法重写该方法，而添加事务功能。

> 注意：如果某个方法是 static 的，同样无法通过动态代理，变成事务方法。 

## 3.方法内部调用

有时候我们需要在某个 Service 类的某个方法中，调用另外一个事务方法，比如：

```java
@Service
public class UserService {
 
    @Autowired
    private UserMapper userMapper;
 
  
    public void add(UserModel userModel) {
        userMapper.insertUser(userModel);
        updateStatus(userModel);
    }
 
    @Transactional
    public void updateStatus(UserModel userModel) {
        doSameThing();
    }
}
```

我们看到在事务方法 add 中，直接调用事务方法 updateStatus。从前面介绍的内容可以知道，updateStatus 方法拥有事务的能力是因为 spring aop 生成代理了对象，但是这种方法直接调用了 this 对象的方法，所以 updateStatus 方法不会生成事务。

由此可见，在同一个类中的方法直接内部调用，会导致事务失效。

那么问题来了，如果有些场景，确实想在同一个类的某个方法中，调用它自己的另外一个方法，该怎么办呢？

### 3.1 新加一个 Service 方法

这个方法非常简单，只需要新加一个 Service 方法，把 @Transactional 注解加到新 Service 方法上，把需要事务执行的代码移到新方法中。具体代码如下：

```java
@Servcie
public class ServiceA {
   @Autowired
   prvate ServiceB serviceB;
 
   public void save(User user) {
         queryData1();
         queryData2();
         serviceB.doSave(user);
   }
 }
 
 @Servcie
 public class ServiceB {
 
    @Transactional(rollbackFor=Exception.class)
    public void doSave(User user) {
       addData1();
       updateData2();
    }
 
 }
```

### 3.2 在该 Service 类中注入自己

如果不想再新加一个 Service 类，在该 Service 类中注入自己也是一种选择。具体代码如下：

```java
@Servcie
public class ServiceA {
   @Autowired
   prvate ServiceA serviceA;
 
   public void save(User user) {
         queryData1();
         queryData2();
         serviceA.doSave(user);
   }
 
   @Transactional(rollbackFor=Exception.class)
   public void doSave(User user) {
       addData1();
       updateData2();
    }
 }
```

可能有些人会有这样的疑问：这种做法会不会出现循环依赖问题？

答案：不会。

其实 spring ioc 内部的三级缓存保证了它不会出现循环依赖问题。

### 3.3 通过 AopContent 类

在该 Service 类中使用 AopContext.currentProxy() 获取代理对象。

上面的方法 2 确实可以解决问题，但是代码看起来并不直观，还可以通过在该 Service 类中使用 AOPProxy 获取代理对象，实现相同的功能。具体代码如下：

```java
@Servcie
public class ServiceA {
 
   public void save(User user) {
         queryData1();
         queryData2();
         ((ServiceA)AopContext.currentProxy()).doSave(user);
   }
 
   @Transactional(rollbackFor=Exception.class)
   public void doSave(User user) {
       addData1();
       updateData2();
    }
 }
```

## 4.未被 spring 管理

在我们平时开发过程中，有个细节很容易被忽略，即使用 spring 事务的前提是：对象要被 spring 管理，需要创建 bean 实例。

通常情况下，我们通过 @Controller、@Service、@Component、@Repository 等注解，可以自动实现 bean 实例化和依赖注入的功能。

如果有一天，你匆匆忙忙地开发了一个 Service 类，但忘了加 @Service 注解，比如：

```java
//@Service
public class UserService {
 
    @Transactional
    public void add(UserModel userModel) {
         saveData(userModel);
         updateData(userModel);
    }    
}
```

从上面的例子，我们可以看到 UserService 类没有加`@Service`注解，那么该类不会交给 spring 管理，所以它的 add 方法也不会生成事务。 

## 5.多线程调用

在实际项目开发中，多线程的使用场景还是挺多的。如果 spring 事务用在多线程场景中，会有问题吗？

```java
@Slf4j
@Service
public class UserService {
 
    @Autowired
    private UserMapper userMapper;
    @Autowired
    private RoleService roleService;
 
    @Transactional
    public void add(UserModel userModel) throws Exception {
        userMapper.insertUser(userModel);
        new Thread(() -> {
            roleService.doOtherThing();
        }).start();
    }
}
 
@Service
public class RoleService {
 
    @Transactional
    public void doOtherThing() {
        System.out.println("保存role表数据");
    }
}
```

从上面的例子中，我们可以看到事务方法 add 中，调用了事务方法 doOtherThing，但是事务方法 doOtherThing 是在另外一个线程中调用的。

这样会导致两个方法不在同一个线程中，获取到的数据库连接不一样，从而是两个不同的事务。如果想 doOtherThing 方法中抛了异常，add 方法也回滚是不可能的。

如果看过 spring 事务源码的朋友，可能会知道 spring 的事务是通过数据库连接来实现的。当前线程中保存了一个 map，key 是数据源，value 是数据库连接。

```java
private static final ThreadLocal<Map<Object, Object>> resources = 
    new NamedThreadLocal<>("Transactional resources");
```

我们说的同一个事务，其实是指同一个数据库连接，只有拥有同一个数据库连接才能同时提交和回滚。如果在不同的线程，拿到的数据库连接肯定是不一样的，所以是不同的事务。 

## 6.表不支持事务

众所周知，在 mysql5 之前，默认的数据库引擎是myisam。

它的好处就不用多说了：索引文件和数据文件是分开存储的，对于查多写少的单表操作，性能比 innodb 更好。

有些老项目中，可能还在用它。

在创建表的时候，只需要把ENGINE参数设置成MyISAM即可：

```mysql
CREATE TABLE `category` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `one_category` varchar(20) COLLATE utf8mb4_bin DEFAULT NULL,
  `two_category` varchar(20) COLLATE utf8mb4_bin DEFAULT NULL,
  `three_category` varchar(20) COLLATE utf8mb4_bin DEFAULT NULL,
  `four_category` varchar(20) COLLATE utf8mb4_bin DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
```

myisam 好用，但有个很致命的问题是：不支持事务。

如果只是单表操作还好，不会出现太大的问题。但如果需要跨多张表操作，由于其不支持事务，数据极有可能会出现不完整的情况。

此外，myisam 还不支持行锁和外键。

所以在实际业务场景中，myisam 使用的并不多。在 mysql5 以后，myisam 已经逐渐退出了历史的舞台，取而代之的是 innodb。

> 有时候我们在开发的过程中，发现某张表的事务一直都没有生效，那不一定是 spring 事务的锅，最好确认一下你使用的那张表，是否支持事务。



## 7.未开启事务

有时候，事务没有生效的根本原因是没有开启事务。

你看到这句话可能会觉得好笑。

开启事务不是一个项目中，最最最基本的功能吗？

为什么还会没有开启事务？

没错，如果项目已经搭建好了，事务功能肯定是有的。

但如果你是在搭建项目 demo 的时候，只有一张表，而这张表的事务没有生效。那么会是什么原因造成的呢？

当然原因有很多，但没有开启事务，这个原因极其容易被忽略。

如果你使用的是 springboot 项目，那么你很幸运。因为 springboot 通过DataSourceTransactionManagerAutoConfiguration类，已经默默地帮你开启了事务。

你所要做的事情很简单，只需要配置spring.datasource相关参数即可。

但如果你使用的还是传统的 spring 项目，则需要在 applicationContext.xml 文件中，手动配置事务相关参数。如果忘了配置，事务肯定是不会生效的。

具体配置信息如下：

```java
<!-- 配置事务管理器 --> 
<bean class="org.springframework.jdbc.datasource.DataSourceTransactionManager" id="transactionManager"> 
    <property name="dataSource" ref="dataSource"></property> 
</bean> 
<tx:advice id="advice" transaction-manager="transactionManager"> 
    <tx:attributes> 
        <tx:method name="*" propagation="REQUIRED"/>
    </tx:attributes> 
</tx:advice> 
<!-- 用切点把事务切进去 --> 
<aop:config> 
    <aop:pointcut expression="execution(* com.susan.*.*(..))" id="pointcut"/> 
    <aop:advisor advice-ref="advice" pointcut-ref="pointcut"/> 
</aop:config> 
```

 默默地说一句，如果在 pointcut 标签中的切入点匹配规则，配错了的话，有些类的事务也不会生效。 



# 二、事务不回滚

## 1.错误的传播特性 

 如果我们在手动设置 propagation 参数的时候，把传播特性设置错了，比如： 

```java
@Service
public class UserService {
 	
    @Transactional(propagation = Propagation.NEVER)
    public void add(UserModel userModel) {
        saveData(userModel);
        updateData(userModel);
    }
}
```

我们可以看到 add 方法的事务传播特性定义成了 Propagation.NEVER，这种类型的传播特性不支持事务，如果有事务则会抛异常。

目前只有这三种传播特性才会创建新事务：REQUIRED，REQUIRES_NEW，NESTED。

## 2.自己吞了异常

事务不会回滚，最常见的问题是：开发者在代码中手动 try...catch 了异常。比如：

```java
@Slf4j
@Service
public class UserService {
    
    @Transactional
    public void add(UserModel userModel) {
        try {
            saveData(userModel);
            updateData(userModel);
        } catch (Exception e) {
            log.error(e.getMessage(), e);
        }
    }
}
```

这种情况下 spring 事务当然不会回滚，因为开发者自己捕获了异常，又没有手动抛出，换句话说就是把异常吞掉了。

如果想要 spring 事务能够正常回滚，必须抛出它能够处理的异常。如果没有抛异常，则 spring 认为程序是正常的。

## 3.手动抛了别的异常

即使开发者没有手动捕获异常，但如果抛的异常不正确，spring 事务也不会回滚。

```java
@Slf4j
@Service
public class UserService {
    
    @Transactional
    public void add(UserModel userModel) throws Exception {
        try {
             saveData(userModel);
             updateData(userModel);
        } catch (Exception e) {
            log.error(e.getMessage(), e);
            throw new Exception(e);
        }
    }
}
```

上面的这种情况，开发人员自己捕获了异常，又手动抛出了异常：Exception，事务同样不会回滚。

因为 spring 事务，默认情况下只会回滚`RuntimeException`（运行时异常）和`Error`（错误），对于普通的 Exception（非运行时异常），它不会回滚。

打开 Spring 的 DefaultTransactionAttribute 类能看到如下代码块，可以发现相关证据，通过注释也能看到 Spring 这么做的原因，大概的意思是受检异常一般是业务异常，或者说是类似另一种方法的返回值，出现这样的异常可能业务还能完成，所以不会主动回滚；而 Error 或 RuntimeException 代表了非预期的结果，应该回滚： 

```java
/**
 * The default behavior is as with EJB: rollback on unchecked exception
 * ({@link RuntimeException}), assuming an unexpected outcome outside of any
 * business rules. Additionally, we also attempt to rollback on {@link Error} which
 * is clearly an unexpected outcome as well. By contrast, a checked exception is
 * considered a business exception and therefore a regular expected outcome of the
 * transactional business method, i.e. a kind of alternative return value which
 * still allows for regular completion of resource operations.
 * <p>This is largely consistent with TransactionTemplate's default behavior,
 * except that TransactionTemplate also rolls back on undeclared checked exceptions
 * (a corner case). For declarative transactions, we expect checked exceptions to be
 * intentionally declared as business exceptions, leading to a commit by default.
 * @see org.springframework.transaction.support.TransactionTemplate#execute
 */
@Override
public boolean rollbackOn(Throwable ex) {
   return (ex instanceof RuntimeException || ex instanceof Error);
}
```

## 4.自定义了回滚异常

在使用 @Transactional 注解声明事务时，有时我们想自定义回滚的异常，spring 也是支持的。可以通过设置`rollbackFor`参数，来完成这个功能。

但如果这个参数的值设置错了，就会引出一些莫名其妙的问题，例如：

```java
@Slf4j
@Service
public class UserService {
    
    @Transactional(rollbackFor = BusinessException.class)
    public void add(UserModel userModel) throws Exception {
       saveData(userModel);
       updateData(userModel);
    }
}
```

如果在执行上面这段代码，保存和更新数据时，程序报错了，抛了 SqlException、DuplicateKeyException 等异常。而 BusinessException 是我们自定义的异常，报错的异常不属于 BusinessException，所以事务也不会回滚。

即使 rollbackFor 有默认值，但阿里巴巴开发者规范中，还是要求开发者重新指定该参数。

这是为什么呢？

因为如果使用默认值，一旦程序抛出了 Exception，事务不会回滚，这会出现很大的 bug。所以，建议一般情况下，将该参数设置成：Exception 或 Throwable。

## 5.嵌套事务回滚

嵌套事务的例子，实现的效果是主方法出现异常，子方法的嵌套事务也会回滚。 

```java
@Service
@Slf4j
public class UserService {

    @Autowired
    private UserDataMapper userDataMapper;

    @Autowired
    private SubUserService subUserService;


    @Transactional
    public void createUser(String name) {
        createMainUser(name);
        try {
            subUserService.createSubUser(name);
        } catch (Exception ex) {
            log.error("create sub user error:{}", ex.getMessage());
        }
        //如果createSubUser是NESTED模式，这里抛出异常会导致嵌套事务无法『提交』
        throw new RuntimeException("create main user error");
    }

    private void createMainUser(String name) {
        userDataMapper.insert(name, "main");
    }
}
 
@Service
@Slf4j
public class SubUserService {

    @Autowired
    private UserDataMapper userDataMapper;

    //比较切换为REQUIRES_NEW，这里的createSubUser可以插入数据成功
    @Transactional(propagation = Propagation.NESTED)
    public void createSubUser(String name) {
        userDataMapper.insert(name, "sub");
    }
}
```

执行日志如下图所示： 

![Nginx 502 Bad Gateway]({{ site.url }}/images{{ page.url }}/嵌套事务1.png) 

每个 NESTED 事务执行前，会将当前操作保存下来，叫做 savepoint（保存点）。NESTED 事务在外部事务提交以后自己才会提交，如果当前 NESTED 事务执行失败，则回滚到之前的保存点。 

# 三、其他

## 1.请确认事务传播配置是否符合自己的业务逻辑 ★

有这么一个场景：一个用户注册的操作，会插入一个主用户到用户表，还会注册一个关联的子用户。我们希望将子用户注册的数据库操作作为一个独立事务来处理，即使失败也不会影响主流程，即不影响主用户的注册。接下来，我们模拟一个实现类似业务逻辑的 UserService： 

```java
@Autowired
private UserRepository userRepository;

@Autowired
private SubUserService subUserService;

@Transactional
public void createUserWrong(UserEntity entity) {
    createMainUser(entity);
    subUserService.createSubUserWithExceptionWrong(entity);
}

private void createMainUser(UserEntity entity) {
    userRepository.save(entity);
    log.info("createMainUser finish");
}
```

SubUserService 的 createSubUserWithExceptionWrong 实现正如其名，因为最后我们抛出了一个运行时异常，错误原因是用户状态无效，所以子用户的注册肯定是失败的。我们期望子用户的注册作为一个事务单独回滚，不影响主用户的注册，这样的逻辑可以实现吗？ 

```java
@Service
@Slf4j
public class SubUserService {

    @Autowired
    private UserRepository userRepository;

    @Transactional
    public void createSubUserWithExceptionWrong(UserEntity entity) {
        log.info("createSubUserWithExceptionWrong start");
        userRepository.save(entity);
        throw new RuntimeException("invalid status");
    }
}
```

调用后可以在日志中发现如下信息，很明显事务回滚了，最后 Controller 打出了创建子用户抛出的运行时异常： 

```java
[22:50:42.866] [http-nio-45678-exec-8] [DEBUG] [o.s.orm.jpa.JpaTransactionManager       :555 ] - Rolling back JPA transaction on EntityManager [SessionImpl(103972212<open>)]
[22:50:42.869] [http-nio-45678-exec-8] [DEBUG] [o.s.orm.jpa.JpaTransactionManager       :620 ] - Closing JPA EntityManager [SessionImpl(103972212<open>)] after transaction
[22:50:42.869] [http-nio-45678-exec-8] [ERROR] [t.d.TransactionPropagationController:23  ] - createUserWrong failed, reason:invalid status	
```

你马上就会意识到，不对呀，因为运行时异常逃出了 @Transactional 注解标记的 createUserWrong 方法，Spring 当然会回滚事务了。如果我们希望主方法不回滚，应该把子方法抛出的异常捕获了。 

也就是这么改，把 subUserService.createSubUserWithExceptionWrong 包裹上 catch，这样外层主方法就不会出现异常了： 

```java
@Transactional
public void createUserWrong2(UserEntity entity) {
    createMainUser(entity);
    try{
        subUserService.createSubUserWithExceptionWrong(entity);
    } catch (Exception ex) {
        // 虽然捕获了异常，但是因为没有开启新事务，而当前事务因为异常已经被标记为rollback了，所以最终还是会回滚。
        log.error("create sub user error:{}", ex.getMessage());
    }
}
```

运行程序后可以看到如下日志： 

```java
[22:57:21.722] [http-nio-45678-exec-3] [DEBUG] [o.s.orm.jpa.JpaTransactionManager       :370 ] - Creating new transaction with name [org.geekbang.time.commonmistakes.transaction.demo3.UserService.createUserWrong2]: PROPAGATION_REQUIRED,ISOLATION_DEFAULT
[22:57:21.739] [http-nio-45678-exec-3] [INFO ] [t.c.transaction.demo3.SubUserService:19  ] - createSubUserWithExceptionWrong start
[22:57:21.739] [http-nio-45678-exec-3] [DEBUG] [o.s.orm.jpa.JpaTransactionManager       :356 ] - Found thread-bound EntityManager [SessionImpl(1794007607<open>)] for JPA transaction
[22:57:21.739] [http-nio-45678-exec-3] [DEBUG] [o.s.orm.jpa.JpaTransactionManager       :471 ] - Participating in existing transaction
[22:57:21.740] [http-nio-45678-exec-3] [DEBUG] [o.s.orm.jpa.JpaTransactionManager       :843 ] - Participating transaction failed - marking existing transaction as rollback-only
[22:57:21.740] [http-nio-45678-exec-3] [DEBUG] [o.s.orm.jpa.JpaTransactionManager       :580 ] - Setting JPA transaction on EntityManager [SessionImpl(1794007607<open>)] rollback-only
[22:57:21.740] [http-nio-45678-exec-3] [ERROR] [.g.t.c.transaction.demo3.UserService:37  ] - create sub user error:invalid status
[22:57:21.740] [http-nio-45678-exec-3] [DEBUG] [o.s.orm.jpa.JpaTransactionManager       :741 ] - Initiating transaction commit
[22:57:21.740] [http-nio-45678-exec-3] [DEBUG] [o.s.orm.jpa.JpaTransactionManager       :529 ] - Committing JPA transaction on EntityManager [SessionImpl(1794007607<open>)]
[22:57:21.743] [http-nio-45678-exec-3] [DEBUG] [o.s.orm.jpa.JpaTransactionManager       :620 ] - Closing JPA EntityManager [SessionImpl(1794007607<open>)] after transaction
[22:57:21.743] [http-nio-45678-exec-3] [ERROR] [t.d.TransactionPropagationController:33  ] - createUserWrong2 failed, reason:Transaction silently rolled back because it has been marked as rollback-only
org.springframework.transaction.UnexpectedRollbackException: Transaction silently rolled back because it has been marked as rollback-only
...
```

需要注意以下几点：

- 如第 1 行所示，对 createUserWrong2 方法开启了异常处理；

- 如第 5 行所示，子方法因为出现了运行时异常，标记当前事务为回滚；

- 如第 7 行所示，主方法的确捕获了异常打印出了 create sub user error 字样；

- 如第 9 行所示，主方法提交了事务；奇怪的是，

- 如第 11 行和 12 行所示，**Controller 里出现了一个 UnexpectedRollbackException，异常描述提示最终这个事务回滚了，而且是静默回滚的。**之所以说是静默，是因为 createUserWrong2 方法本身并没有出异常，只不过提交后发现子方法已经把当前事务设置为了回滚，无法完成提交。 

这挺反直觉的。**我们之前说，出了异常事务不一定回滚，这里说的却是不出异常，事务也不一定可以提交。**原因是，主方法注册主用户的逻辑和子方法注册子用户的逻辑是同一个事务，子逻辑标记了事务需要回滚，主逻辑自然也不能提交了。 

看到这里，修复方式就很明确了，想办法让子逻辑在独立事务中运行，也就是改一下 SubUserService 注册子用户的方法，为注解加上 propagation = Propagation.REQUIRES_NEW 来设置 REQUIRES_NEW 方式的事务传播策略，也就是执行到这个方法时需要开启新的事务，并挂起当前事务： 

```java
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void createSubUserWithExceptionRight(UserEntity entity) {
    log.info("createSubUserWithExceptionRight start");
    userRepository.save(entity);
    throw new RuntimeException("invalid status");
}
```

主方法没什么变化，同样需要捕获异常，防止异常漏出去导致主事务回滚，重新命名为 createUserRight： 

```java
@Transactional
public void createUserRight(UserEntity entity) {
    createMainUser(entity);
    try{
        subUserService.createSubUserWithExceptionRight(entity);
    } catch (Exception ex) {
        // 捕获异常，防止主方法回滚
        log.error("create sub user error:{}", ex.getMessage());
    }
}
```



## 2.大事务问题

在使用 spring 事务时，有个让人非常头疼的问题，就是大事务问题。

通常情况下，我们会在方法上加`@Transactional`注解，添加事务功能，比如：

```java
@Service
public class UserService {
    
    @Autowired 
    private RoleService roleService;
    
    @Transactional
    public void add(UserModel userModel) throws Exception {
       query1();
       query2();
       query3();
       roleService.save(userModel);
       update(userModel);
    }
}
 
 
@Service
public class RoleService {
    
    @Autowired 
    private RoleService roleService;
    
    @Transactional
    public void save(UserModel userModel) throws Exception {
       query4();
       query5();
       query6();
       saveData(userModel);
    }
}
```

但`@Transactional`注解，如果被加到方法上，有个缺点就是整个方法都包含在事务当中了。

上面的这个例子中，在 UserService 类中，其实只有这两行才需要事务：

```java
roleService.save(userModel);
update(userModel);
```

在 RoleService 类中，只有这一行需要事务： 

```java
saveData(userModel);
```

现在的这种写法，会导致所有的 query 方法也被包含在同一个事务当中。

如果 query 方法非常多，调用层级很深，而且有部分查询方法比较耗时的话，会造成整个事务非常耗时，而从造成大事务问题。

## 3.编程式事务

上面聊的这些内容都是基于`@Transactional`注解的，主要说的是它的事务问题，我们把这种事务叫做：`声明式事务`。

其实，spring 还提供了另外一种创建事务的方式，即通过手动编写代码实现的事务，我们把这种事务叫做：`编程式事务`。例如：

```java
@Autowired
private TransactionTemplate transactionTemplate;

...

public void save(final User user) {
    queryData1();
    queryData2();
    transactionTemplate.execute((status) = > {
            addData1();
    updateData2();
    return Boolean.TRUE;
    })
}
```

在 spring 中为了支持编程式事务，专门提供了一个类：TransactionTemplate，在它的 execute 方法中，就实现了事务的功能。

相较于@Transactional注解声明式事务，我更建议大家使用基于TransactionTemplate的编程式事务。主要原因如下：

避免由于 spring aop 问题导致事务失效的问题。

能够更小粒度地控制事务的范围，更直观。

> 建议在项目中少使用 @Transactional 注解开启事务。但并不是说一定不能用它，如果项目中有些业务逻辑比较简单，而且不经常变动，使用 @Transactional 注解开启事务也无妨，因为它更简单，开发效率更高，但是千万要小心事务失效的问题。



# 参考资料

- [1]  [spring 事务失效的 12 种场景](https://blog.csdn.net/hanjiaqian/article/details/120501741)
- [2]  [20%的业务代码的Spring声明式事务，可能都没处理正确](https://time.geekbang.org/column/article/213295)
