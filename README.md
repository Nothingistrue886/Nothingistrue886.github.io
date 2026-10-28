# Zuofei's Notes

个人技术博客：<https://nothingistrue886.github.io>

## 本地运行

```bash
bundle exec jekyll serve
```

## 写作约定

1. **文章路径**：`_posts/YYYY-MM-DD-slug.md`（网页访问 URL 为 `/posts/slug/`）
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
3. **图片路径**：存放于 `images/posts/slug/`，文内引用：
   ```markdown
   ![说明]({{ site.url }}/images{{ page.url }}example.png)
   ```
