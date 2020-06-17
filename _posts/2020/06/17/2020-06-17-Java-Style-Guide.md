---
layout: post
title: Java Style Guide
categories: [Java, 编程规约]
description: 无规矩不成方圆，无规范难以协同
keywords: Java,  编程规约
---

# 码出高效，码出质量

现代软件架构的复杂性需要协同开发完成，如何高效地协 同呢？无规矩不成方圆，无规范难以协同，比如，制订交通法规表面上是要限制行车权，实际上是保障公众的人身安全，试想如果没有限速，没有红绿灯，谁还敢上路行驶？

对软件来说，适当的规范和标准绝不是消灭代码内容的创造性、优雅性，而是限制过度个性化，以一种普遍认可的统一方式一起做事，提升协作效率，降低沟通成本。代码的字里行间流淌的是软件系统的血液，质量的提升是尽可能少踩坑，杜绝踩重复的坑，切实提升系统稳定性，码出质量。

# 1 所有标识符通用规则

标识符仅使用ASCII字母和数字，仅在以下指出的少数情况下，使用下划线。因此，每个有效的标识符名称都由正则表达式匹配 `\w+`。 

# 2 标识符类型规则

**项目名**

项目名(文件夹)全部小写，多个单词之间用中划线分割。例如，`spring-cloud`.

**包名**

包名统一使用小写字母，点分隔符之间有且仅有一个自然语义的英语单词。例如， `com.example.deepspace`, not `com.example.deepSpace` or `com.example.deep_space`. 

包名统一使用 单数形式，但是类名如果有复数含义，类名可以使用复数形式。 

**类名**

类名以大驼峰命名法([UpperCamelCase](#驼峰式命名法CamelCase)) 风格编写。

类名通常是名词或名词短语。 例如， `Character`或 `ImmutableList`。接口名称也可以是名词或名词短语（例如`List`），但有时也可以是形容词或形容词短语（例如 `Readable`）。 

*测试*类的名称以要*测试的*类的名称开头，以`Test`结尾。例如， `HashTest`或 `HashIntegrationTest`。 

*抽象*类命名使用 `Abstract` 或 `Base` 开头；*异常*类命名使用 `Exception` 结尾；

**方法名**

类名以小驼峰命名法([lowerCamelCase](#驼峰式命名法CamelCase)) 风格编写。

方法名通常是动词或动词短语。 For example, `sendMessage` or `stop`. 

下划线可能会出现在 JUnit 测试方法名称中，以分隔名称的逻辑组成部分，每个组成部分均用`lowerCamelCase`编写。 

**常量名**

常量名以 `CONSTANT_CASE `风格编写。

所有字母全都大写，每个单词之间用下划线分隔，力求语义表达完整清楚，不要嫌名字长。但究竟什么是常量？

常量是静态的final字段，其内容是不可变的。

如果实例的任何可观察状态是可改变，它就不是一个常量。

```java
// Constants
static final int NUMBER = 5;
static final ImmutableList<String> NAMES = ImmutableList.of("Ed", "Ann");
static final ImmutableMap<String, Integer> AGES = ImmutableMap.of("Ed", 35, "Ann", 32);
static final Joiner COMMA_JOINER = Joiner.on(','); // because Joiner is immutable
static final SomeMutableType[] EMPTY_ARRAY = {};
enum SomeEnum { ENUM_CONSTANT }

// Not constants
static String nonFinal = "non-final";
final String nonStatic = "non-static";
static final Set<String> mutableCollection = new HashSet<String>();
static final ImmutableSet<SomeMutableType> mutableElements = ImmutableSet.of(mutable);
static final ImmutableMap<String, SomeMutableType> mutableValues =
    ImmutableMap.of("Ed", mutableInstance, "Ann", mutableInstance2);
static final Logger logger = Logger.getLogger(MyClass.getName());
static final String[] nonEmptyArray = {"these", "can", "change"};
```

这些名字通常是名词或名词短语。

**非常量字段名**

非常量字段名以`lowerCamelCase`风格编写。

这些名称通常是名词或名词短语。例如， `computedValues`或 `index`。 

**参数名**

参数名以`lowerCamelCase`风格编写。 

公共方法中应避免使用一个字符的参数名。

**局部变量名**

局部变量名以`lowerCamelCase`风格编写。 

即使是final和不可变的，局部变量也不被认为是常量，也不应该被设计成常量。

|  类型  |                        约定                        |                      例                       |
| :----: | :------------------------------------------------: | :-------------------------------------------: |
| 项目名 |         全部小写，多个单词用中划线分隔‘-’          |                 spring-cloud                  |
|  包名  |                      全部小写                      |             com.alibaba.fastjson              |
|  类名  |                   单词首字母大写                   | Feature,ParserConfig,DefaultFieldDeserializer |
| 方法名 |                       同变量                       |        read(), readObject(), getById()        |
| 常量名 |           全部大写，多个单词，用'_'分隔            |              CACHE_EXPIRED_TIME               |
| 变量名 | 首字母小写，多个单词组成时，其他单词首字母都要大写 |              password, userName               |


# 驼峰式命名法CamelCase

**驼峰式命名法**分大驼峰式命名法(UpperCamelCase)和小驼峰式命名法(lowerCamelCase)。 有时，我们有不只一种合理的方式将一个英语词组转换成驼峰形式，如缩略语或不寻常的结构(例如”IPv6”或”iOS”)。Google指定了以下的转换方案。

名字从`散文形式`(prose form)开始:

1. 把短语转换为纯ASCII码，并且移除任何单引号。例如：”Müller’s algorithm”将变成”Muellers algorithm”。
2. 将此结果分为单词、空格和任何剩余的标点符号（通常是连字符）。
   - 推荐：如果某个单词已经有了常用的驼峰表示形式，按它的组成将它分割开(如”AdWords”将分割成”ad words”)。 需要注意的是”iOS”并不是一个真正的驼峰表示形式，因此该推荐对它并不适用。
3. 现在将所有字母都小写(包括缩写)，然后将单词的第一个字母大写：
   - 每个单词的第一个字母都大写，来得到大驼峰式命名。
   - 除了第一个单词，每个单词的第一个字母都大写，来得到小驼峰式命名。
4. 最后将所有的单词连接起来得到一个标识符。

注意，原文的大小写几乎被完全忽略。示例：

|  1   | Prose form              | Correct           | Incorrect         |
| :--: | :---------------------- | :---------------- | :---------------- |
|  2   | "XML HTTP request"      | XmlHttpRequest    | XMLHTTPRequest    |
|  3   | "new customer ID"       | newCustomerId     | newCustomerID     |
|  4   | "inner stopwatch"       | innerStopwatch    | innerStopWatch    |
|  5   | "supports IPv6 on iOS?" | supportsIpv6OnIos | supportsIPv6OnIOS |
|  6   | "YouTube importer"      | YouTubeImporter   |                   |

> Note：在英语中，某些带有连字符的单词形式不唯一。例如：”nonempty”和”non-empty”都是正确的，因此方法名`checkNonempty`和`checkNonEmpty`也都是正确的。

---

```
参考文献
《码出高效》、《Java开发手册》
https://google.github.io/styleguide/javaguide.html
https://www.cnblogs.com/liqiangchn/p/12000361.html
```

