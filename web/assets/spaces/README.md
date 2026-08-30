# 地点图片目录

建议按地点 ID 建子目录，例如：

```text
web/assets/spaces/N006/cover.jpg
```

空间数据中的图片 URL 写为 `/assets/spaces/N006/cover.jpg`。图片文件与
`app/data/spaces.json` 中的 `images` 元数据分离，检索时通过 `space_id`
和 `chunk_id` 关联。加入真实图片前，应核实来源、授权和描述文本。
