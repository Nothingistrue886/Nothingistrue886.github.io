---
layout: post
title: 设计模式-单例模式
categories: [Design pattern]
description: 一种常用的软件设计模式
keywords: 设计模式, 单例模式

---

# 单例模式

> 单例模式(Singleton)，属于创建类型的一种常用的软件设计模式。 
>
> 通过单例模式的方法创建的实例对象，在当前进程中只有一个。 

**单例模式的要点有三个:** 

1. 某个类只能有一个实例；

2. 它必须自行创建这个实例； 

3. 它必须自行向整个系统提供这个实例。

**从具体实现角度来说，就是以下三点：**

1. 该类的构造函数私有化；

2. 该类定义中含有一个该类的静态私有对象； 

3. 该类对外提供一个公共的静态函数用于创建或获取它本身的静态私有对象。

## 饿汉模式

```java
/**
 * 饿汉模式：
 * 线程安全，比较常用，但容易产生垃圾。
 * 因为一开始就初始化，避免了线程同步问题。
 */
public class SingletonEH {
    // 私有的静态对象，防止外界引用
    private static SingletonEH instance = new SingletonEH();    
	// 构造方法私有化，防止外界实例化此对象
    private SingletonEH() {                                     
    }
	// 向外界提供获取实例化对象的静态方法
    public static SingletonEH getInstance() {                    
        return instance;
    }                                       
}
```

## 懒汉模式

```java
/**
 * 懒汉模式：
 * 线程不安全，延迟初始化，严格意义上不是不是单例模式
 * 多线程下会出现不唯一对象，可以在静态方法中加 synchronized 关键字
 */
public class SingletonLH {
    // 此处赋值为null，目的是实现延迟加载Lazy Loading
    private static SingletonLH instance = null;     

    private SingletonLH() {
    }

    public static SingletonLH getInstance() {
        if (instance == null) {
            instance = new SingletonLH();
        }
        return instance;
    }
}
```

## 双重锁模式

```java
/**
 * 采用双重锁机制，线程安全且在多线程情况下能保持高性能。
 *  
 *  volatile关键字
 *  1. 可见性
 *  2. 禁止重排序
 *  3. 不保证原子性
 */
public class SingletonLock {
    
    private static volatile SingletonLock instance = null;

    private SingletonLock() {
    }

    public static SingletonLock getInstance() {
        // 先判断实例对象是否存在，不存在则进入同步锁创建
        if (instance == null) {        
            // 多线程下只有一个线程可以进入同步锁，实例化代码只用执行一次，后面再次访问时，判断第一个if (singleton == null)，直接return实例化对象。
            synchronized (SingletonLock.class) {            
                if (instance == null) {
                    // 对象的创建在JVM中可能会进行重排序，在多线程访问下存在风险，使用volatile修饰instance实例变量
                    instance = new SingletonLock();         
                }
            }
        }
        return instance;
    }
}

```

## 静态内部类

```java
/**
 * 静态内部类：
 * 线程安全，延迟加载，保证实例对象唯一。
 * 外部类加载时不需要立即加载内部类，
 * 只有在第一次调用 getInstance() 方法时，才会加载内部类。
 */
public class SingletonJT {

    private SingletonJT() {
    }

    private static class Inner {
        private static final SingletonJT instance = new SingletonJT();
    }

    public static SingletonJT getInstance() {
        return Inner.instance;
    }
}
```

## 枚举

```java
/**
 * 默认枚举实例的创建是线程安全的，并且在任何情况下都是单例。
 */
public enum SingletonEnum {
    INSTANCE;

    // 可以省略此方法，通过Singleton.INSTANCE进行操作
    public static SingletonEnum getInstance() {
        return SingletonEnum.INSTANCE;
    }
}

```

