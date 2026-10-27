# Nothingistrue886.github.io

个人技术博客：<https://nothingistrue886.github.io>

## 本地运行

```bash
bundle exec jekyll serve
```

## 写作约定

1. **文章路径**：`_posts/YYYY/MM/DD/YYYY-MM-DD-slug.md`
2. **Front Matter 模板**：
   ```yaml
   ---
   layout: post
   title: 文章标题
   categories: [分类名]
   description: 一句话摘要
   keywords: 关键词1, 关键词2
   ---
   ```
3. **图片路径**：存放于 `images/YYYY/MM/DD/slug/`，文内引用：
   ```markdown
   ![说明]({{ site.url }}/images/YYYY/MM/DD/slug/example.png)
   ```
