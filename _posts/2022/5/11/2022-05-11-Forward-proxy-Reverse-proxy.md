---
layout: post
title: 正向代理和反向代理
categories: [basis]
description: 正向代理和反向代理总结
keywords: proxy
---

通常情况下，咱们作为客户端(Client)，访问网络上的资源，都是发送请求到互联网(Internet)，之后导向相应的服务端(Server)获取资源。 

![没有加任何代理的网络访问]({{ site.url }}/images{{ page.url }}/没有加任何代理的网络访问.png)

## 什么是正向代理(Proxy)?

A同学在大众创业、万众创新的大时代背景下开启他的创业之路，目前他遇到的最大的一个问题就是启动资金，于是他决定去找马云爸爸借钱，可想而知，最后碰一鼻子灰回来了，情急之下，他想到一个办法，找关系开后门，经过一番消息打探，原来A同学的大学老师王老师是马云的同学，于是A同学找到王老师，托王老师帮忙去马云那借500万过来，当然最后事成了。不过马云并不知道这钱是A同学借的，马云是借给王老师的，最后由王老师转交给A同学。这里的王老师在这个过程中扮演了一个非常关键的角色，就是**代理**，也可以说是正向代理，王老师代替A同学办这件事，这个过程中，真正借钱的人是谁，马云是不知道的，这点非常关键。

我们常说的代理也就是只正向代理，正向代理的过程，它隐藏了真实的请求客户端，服务端不知道真实的客户端是谁，客户端请求的服务都被代替来请求，某些科学上网工具扮演的就是典型的角色。用浏览器访问https://www.google.com时，被残忍的block，于是你可以在国外搭建一台代理服务器，让代理帮我去请求google.com，代理把请求返回的相应结构再返回给我。

![正向代理(Proxy)]({{ site.url }}/images{{ page.url }}/正向代理(Proxy).png)

如图，正向代理(Proxy)，就是指在Client和Internet之间加一个中间服务，这个服务作为Client的代理人，拦截所有Client发出去的通讯，以代理人的身份再统一发出，从而代表Client和Internet进行交流，避免Client和Internet的直接交流。

这样加上一个正向代理(Proxy)的好处是什么呢？

- Proxy可以隐藏Client的IP, 暴露出去只是Proxy自己的IP，从而保护Client的隐私安全。
- Proxy可以作为缓存，当有相同资源的请求时，可以直接返回缓存内容，提高响应速度。
- Proxy可以作为过滤，限制或者阻断访问Internet上面一些特定内容。
- Proxy可以作为跳板(比如VPN)，访问一些被防火墙或者网络区域限制的内容。

## 什么是反向代理(Reverse Proxy)？

大家都有过这样的经历，拨打10086客服电话，可能一个地区的10086客服有几个或者几十个，你永远都不需要关心在电话那头的是哪一个，叫什么，男的，还是女的，漂亮的还是帅气的，你都不关心，你关心的是你的问题能不能得到专业的解答，你只需要拨通了10086的总机号码，电话那头总会有人会回答你，只是有时慢有时快而已。那么这里的10086总机号码就是我们说的**反向代理**。客户不知道真正提供服务人的是谁。

反向代理隐藏了真实的服务端，当我们请求 www.baidu.com 的时候，就像拨打10086一样，背后可能有成千上万台服务器为我们服务，但具体是哪一台，你不知道，也不需要知道，你只需要知道反向代理服务器是谁就好了，www.baidu.com 就是我们的反向代理服务器，反向代理服务器会帮我们把请求转发到真实的服务器那里去。Nginx就是性能非常好的反向代理服务器，用来做负载均衡。

![反向代理(Reverse Proxy)]({{ site.url }}/images{{ page.url }}/反向代理(Reverse Proxy).png)

如图，反向代理(Reverse Proxy), 就是指在Internet和Web Server之间加上一个中间服务，这个服务作为Web Server的代理人，拦截所有发给Web Server的请求，然后再统一分发给代理的Web Servers, 避免Internet网络流量直接发给Web Server.

这样加上一个反向代理(Reverse Proxy)有什么好处呢？

- ReverseProxy可以隐藏WebServerIP, 只有反向代理的IP暴露网络, 从而保护WebServer。
- ReverseProxy可以作为LoadBalancer，合理分配流量到集群里的WebServer。
- ReverseProxy可以作为网站静态内容的缓存，大大提高响应速度并减轻WebServer负担。
- ReverseProxy可以代为处理SSL加密(计算量较大)，减轻WebServer的负担。

## 两者区别

**正向代理**代理的对象是客户端，**反向代理**代理的对象是服务端 。

## 一些杂谈与工程实践经验

ReverseProxy还有一个比较有意思的功能就是可以作为GlobalServerLoadBalancer，区别于普通的流量分配的LoadBalancer, GlobalServerLoadBalancer的作用更多是让不同地域的人访问网站会更快。大型网站(比如Netflix, Google, Amazon etc)，会在全世界各个地方部署ReverseProxy，然后把相应区域的流量导到地理位置更近的Web Server，从而提供更快速的响应服务。

![图片来源 https://avinetworks.com/glossary/global-server-load-balancing-2/]({{ site.url }}/images{{ page.url }}/demo.png) 

Nginx应该是最常见的[反向代理服务器](https://www.zhihu.com/search?q=反向代理服务器&search_source=Entity&hybrid_search_source=Entity&hybrid_search_extra={"sourceType"%3A"answer"%2C"sourceId"%3A2771833737})之一了，如果你从事Web相关的开发工作，一定对这个报错非常熟悉LOL。 

![Nginx 502 Bad Gateway]({{ site.url }}/images{{ page.url }}/502.png) 

在网络架构的工程实践上，如果一个私有网络想要访问其他网络的资源，那么一般需要给私有网络加上一个正向代理(Proxy)。如果一个私有网络想要被其他网络访问，那么一般需要给私有网络加上一个反向代理(Reverse Proxy)，或者API Gateway(本身也可以算作一种Reverse Proxy)。

![PrivateNetwork - Proxy - PublicNetwork | PublicNetwork - ReverseProxy - PrivateNetwork]({{ site.url }}/images{{ page.url }}/public-private.png) 

```
参考
https://www.zhihu.com/question/24723688/answer/2771833737
https://www.zhihu.com/question/24723688/answer/128105528
```