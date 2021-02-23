---
layout: post
title: 对象要怎样才算相等？
categories: [Java, Java SE]
description: hashcode和equals
keywords: Java,  hashcode, equals
---



# 对象要怎样才算相等？

两个对象的引用怎样才算是相等的？

是引用到相同的对象，还是有相同名称的不同对象也算是相等的？

下面需要引出两个关键的议题：`引用相等性`和`对象相等性`

## 引用相等性

> 堆上同一对象的两个引用

引用到堆上同一个对象的两个引用是相等的。如果两个引用调用`hashcode()`方法，会得到相同的结果。

想要知道两个引用是否相等，可以使用`==`来比较，返回true则说明引用到相同的对象。

![引用相等]({{ site.url }}/images{{ page.url }}/引用相等.jpg)

```java
if(foo == bar) {
// 两个引用都指向同一个对象
}
```

## 对象相等性

> 堆上的两个不同对象在意义上是相等的

想要把两个不同对象视为相等，就必须覆盖从Object继承下来的`hashcode()`方法与`equals()`方法。

只有覆盖过`hashcode()`才能确保两个对象拥有相同的hashcode，也要确保以另一个对象为参数的`equals()`调用会返回true。

![对象相等]({{ site.url }}/images{{ page.url }}/对象相等.jpg)

```
if(foo.hashcode() == bar.hashcode() && foo.equals(bar)) {
// 两个对象是相等的
}
```



## HashSet如何检查重复：hashcode()和equals()

当对象加入HashSet时，他会使用对象的hashcode值来判断对象加入的位置，同时也会与其他已经加入的对象的hashcode值做对比。如果没有相同的hashcode，HashSet就会假设新对象没有重复出现。也就是说，如果hashcode是相异的，则HashSet会假设对象不相同。因此，必须override对象的`hashcode()`来确保对象有相同的值。

但是，具有相同hashcode值的对象也不一定相等，所以如果HashSet找到相同hashcode值的两个对象：新加入的和已经存在的，他会调用其中一个的`equals()`方法来检查两个对象是否真的相同。如果两者相同，HashSet就会知道要加入的对象已经重复，加入操作会不执行。

## hashCode()和equals()相关要求

1. 如果两个对象的equals的结果是相等的，则两个对象的hashcode返回的结果也必须是相同的。
2. 任何时候覆写equals，都必须同时覆写hashcode。

## 总结

`hashcode()`和`equals()`两个方法协同工作可用来判断两个对象是否相等。由于不可避免地存在哈希值冲突的情况，因此当hashcode相同时，还需要再调用equals方法进行一次值得比较；但是，若hashcode不同，则直接判定对象不同，跳过equals，这加快了冲突处理效率。

**注意：**

| 表达式    | 描述                                                       |
| :-------- | :--------------------------------------------------------- |
| `==`      | 基本数据类型比较的是值,引用比较的是对象内存地址            |
| `equals`  | Object类中比较的是对象内存地址,可以重写equals()方法        |
| `hascode` | 返回每个对象特有的序号，依据内存位置计算(哈希冲突不可避免) |

---

```java
参考文献
《HeadFirst Java》
《码出高效》
```