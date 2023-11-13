---
layout: post
title: 基于SpringBoot + Redis + 轮询实现扫码登录
categories: [Java]
description: Scan code to log in
keywords: Java
---

# 一、前言

在生活中，经常有需要用到扫码的地方，例如扫码付款，扫码乘车，扫码登录等，就拿扫码登录来说就用很多平台用到了，例如微信PC端、淘宝、京东、pdd等一些电商平台，二维码似乎已与人们的生活息息相关，今天我就来描述一些如何基于 SpringBoot + Redis 实现扫码登录功能 

# 二、应用场景

要实现一个功能首先等了解其需求，扫码登录一般适用在存在移动端、Web端、PC端等。其目的是为了让用户在使用他们的Web端或PC端时登录更加方便和安全，使用手机扫一扫就可以登录的服务，就显得自然而然了。 

# 三、原理及流程设计

首先，我们先尝试用一句话定义一下扫码登录的本质：扫码登录本质上是**请求登录方**请求**已登录方**将**登录凭证**写入**特定媒介**的过程。这里的请求登录方为 Web 端，已登录方为 APP 端，登录凭证可以是用户信息，也可以是换取用户信息的凭证，而特定媒介是某一张二维码。

具体的扫码登录流程大致如下：

1. 打开登录页面，展示一个二维码，同时轮询二维码状态(web)
2. 打开APP扫描该二维码后，APP显示确认、取消按钮(app)
3. 登录页面显示已扫码或扫描用户的头像等信息(web)
4. 用户在APP上点击确认登录(app)
5. 登录页面从轮询二维码状态得知用户已确认登录，并获取到登录凭证(web)
6. 页面登录成功，并进入主应用程序页面(web)

在整个流程里，二维码显然起到了至关重要的东西，而二维码的本质就是一段文本信息，我们可以将二维码唯一标识、过期时间等信息写入，而通过App扫码即可识别出内容再作相应的处理

这里再来详解一下，二维码总共有哪些状态

1. NOT_SCAN（未扫描）
2. SCANNED（已扫描，待确认）
3. CONFIRMED（已确认）
4. CANCELED（已取消）
5. EXPIRED（已过期）

那么根据以上状态我们可以得出，实现扫码登录功能共需要以下接口

Web端：

1. 二维码生成接口
2. 二维码状态查询接口

App端：

1. 标记扫描接口
2. 确认登录接口
3. 取消登录接口

# 四、实现步骤

### 二维码生成接口（/qrcode/gen）

上面说到，二维码本质是一段文本信息，所以我们需要将一段特定信息写入二维码中，常见的有两种方法

1. 直接将二维码唯一标识、过期时间等相关信息写入，这样客户端可以通过唯一标识进行轮询二维码状态接口
2. 写入一个包含ticket的url，在url后的参数中可以拼上所需参数，这样有个好处是，假设第三方app扫描了此二维码，就会直接访问此url，这时可以用一道重定向跳转到例如下载页引导用户下载

```java
/**
 * 生成二维码
 *
 * @return
 */
@GetMapping("/qrcode/gen")
public Result genQrCode() {
    String url = "http://www.xxxxxx.com?qrcodeToken=%s";
    // 这里用了hutool工具类生成uuid做二维码唯一标识
    // 客户端根据二维码标识轮询状态接口
    String qrcodeToken = IdUtil.fastSimpleUUID();
    // 前端根据url生成二维码
    String intactUrl = String.format(url, qrcodeToken);
    redisRepository.setExpire(QrcodeConstants.STATUS_PREFIX + qrcodeToken, QrcodeConstants.NOT_SCAN, 60);
    Map<String, String> map = Maps.newHashMap();
    map.put("qrcodeToken", qrcodeToken);
    map.put("url", intactUrl);
    return Result.ok(map);
}
```

### 二维码状态查询（/qrcode/status）

这里是最重要的接口，里面包含着各种状态所需要处理的操作

1. 若redis中取出的扫描状态为空（代表已过期）或为已取消，则重新生成二维码内容。此时客户端可以判断，若是返回状态为已过期或已取消，则直接用**newIntactUrl**字段重新生成二维码，这样有个好处是可以动态刷新二维码，节省二维码过期，用户还得点刷新按钮，但这样也有个坏处，就是客户端会一直轮询二维码状态查询接口，有利有弊吧
2. 若redis中取出的扫描状态为已确定，则将token返回出去，客户端可以携带token访问需要登录的接口，但可能有小伙伴要问了，为啥这里的token是从redis中取呢，下面马上解释

```java
/**
 * 状态查询
 * 前端轮询接口 3s一次 根据状态常量操作
 *
 * @param qrcodeToken二维码唯一标识
 * @return
 */
@GetMapping("/qrcode/status")
public Result status(@RequestParam String qrcodeToken) {
    String scanStatus = (String) redisRepository.get(QrcodeConstants.STATUS_PREFIX + qrcodeToken);
    Map<String, Object> resultMap = Maps.newHashMap();
    if (StrUtil.equals(QrcodeConstants.CANCELED, scanStatus) || StrUtil.isBlank(scanStatus)) {
        String newQrcodeToken = IdUtil.fastSimpleUUID();
        String newIntactUrl = String.format(url, newQrcodeToken);
        redisRepository.setExpire(QrcodeConstants.STATUS_PREFIX + newQrcodeToken, QrcodeConstants.NOT_SCAN, 60);
        resultMap.put("newQrcodeToken", newQrcodeToken);
        resultMap.put("newUrl", newIntactUrl);
    } else if (StrUtil.equals(QrcodeConstants.CONFIRMED, scanStatus)) {
        String token = (String) redisRepository.get(QrcodeConstants.TOKEN_PREFIX + qrcodeToken);
        resultMap.put("token", token);
    }
    resultMap.put("status", StrUtil.isNotBlank(scanStatus) ? scanStatus : QrcodeConstants.EXPIRED);
    return Result.ok(resultMap);
}
```

### 扫描二维码接口（/qrcode/scanned）

这里要注意的是有两种处理方法

1. 服务端处理

若是服务端处理，此时需要返回视图，而上文中的url则为此接口地址，将授权页（H5页面）放入项目资源目录下，然后app扫描直接跳转，而服务端则判断若已登录则去授权页，若未登录则重定向到下载页，引导用户下载

2. app端处理

app端扫描二维码时根据二维码内容（例如包含qrcodeToke关键字）跳转并调用此接口标识已扫描（若登录则跳转授权页，未登录则去登录）

```java
/**
 * 扫描接口
 *
 * @param qrcodeToken 二维码唯一标识
 * @return
 */
@GetMapping("/qrcode/scanned")
public Result scanned(@RequestParam String qrcodeToken) {
    String scanStatus = (String) redisRepository.get(QrcodeConstants.STATUS_PREFIX + qrcodeToken);
    if (StrUtil.isBlank(scanStatus) || !QrcodeConstants.NOT_SCAN.equals(scanStatus)) {
        return Result.failed("请刷新二维码后重试");
    }
    redisRepository.setExpire(QrcodeConstants.STATUS_PREFIX + qrcodeToken, QrcodeConstants.SCANNED, 60);
    return Result.ok("扫描成功");
}
```

### 确认登录接口（/qrcode/confirm）

app扫描成功后，二维码状态变成**SCANNED**，此时点击确认登录则需要服务端根据当前登录用户生成一个新的客户端token，这里有人问为啥不用之前已经存在的app端token呢，因为我这里用到是 Security + Oauth2 的认证授权模式，即可以根据不同客户端生成不同token，从而从token有效期及有效范围等多方面进行控制

```java
/**
 * 确认授权
 *
 * @param qrcodeToken 二维码唯一标识
 * @return
 */
@PutMapping("/confirm")
public Result confirm(@RequestParam String qrcodeToken) {
    // 这里模拟获取当前登录用户
    User user = UserUtils.getUser();
    // 扫描状态
    String scanStatus = (String) redisRepository.get(QrcodeConstants.STATUS_PREFIX + qrcodeToken);
    if (StrUtil.isBlank(scanStatus) || !QrcodeConstants.SCANNED.equals(scanStatus)) {
        return Result.failed("请刷新二维码后重试");
    }
    try {
       // 模拟win二维码登录，将token存入redis并改变二维码状态
        String token = loginService.qrcodeLogin(user.getUsername);
        
        redisRepository.setExpire(QrcodeConstants.STATUS_PREFIX + qrcodeToken, QrcodeConstants.CONFIRMED, 60);
        redisRepository.setExpire(QrcodeConstants.TOKEN_PREFIX + qrcodeToken, token , 60);
    } catch (Exception e) {
        log.error("Http调用win二维码登录异常:{}", e.getMessage());
        return Result.failed("确认异常");
    }
    return Result.ok("确认成功");
}
```

### 取消登录接口（/qrcode/cancel）

app扫描成功后，可以选择确认登录或取消登录，若取消登录则调用此接口,并将状态由**SCANNED**变为**CANCELED** 

```java
/**
 * 取消登录
 *
 * @param qrcodeToken 二维码唯一标识
 * @return
 */
@PutMapping("/cancel")
public Result cancel(@RequestParam String qrcodeToken) {
    // 扫描状态
    String scanStatus = (String) redisRepository.get(QrcodeConstants.STATUS_PREFIX + qrcodeToken);
    if (StrUtil.isBlank(scanStatus) || !QrcodeConstants.SCANNED.equals(scanStatus)) {
        return Result.failed("请刷新二维码后重试");
    }
    redisRepository.setExpire(QrcodeConstants.STATUS_PREFIX + qrcodeToken, QrcodeConstants.CANCELED, 60);
    return Result.ok("取消成功");
}
```

### 常量类

```java
/**
 * 二维码相关常量
 *
 * @author Brave
 * @version V1.0
 * @date 2021/6/30
 */
public interface QrcodeConstants {
    /**
     * redis前缀 - 扫描状态
     */
    String STATUS_PREFIX = "qrcode:login:status:";
    /**
     * redis前缀 - token
     */
    String TOKEN_PREFIX = "qrcode:login:token:";
    /**
     * 未扫描
     */
    String NOT_SCAN = "NOT_SCAN";
    /**
     * 已扫描，等待用户确认
     */
    String SCANNED = "SCANNED";
    /**
     * 已扫描，用户同意授权
     */
    String CONFIRMED = "CONFIRMED";
    /**
     * 已扫描，用户取消授权
     */
    String CANCELED = "CANCELED";
    /**
     * 已过期
     */
    String EXPIRED = "EXPIRED";
}
```

```
转载
作者：天青色等烟雨~
链接：https://www.cnblogs.com/z-coding/p/14975275.html
```

