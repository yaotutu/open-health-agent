# 图表生成

## 工具
`generate_chart`

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| spec | string | 是 | 完整的 Vega-Lite JSON 规范字符串 |
| title | string | 否 | 图表标题 |

## 重要：必须生成图片

当用户提到"趋势"、"变化"、"图表"、"统计"、"看看数据"等关键词时，**必须调用 generate_chart 生成图片**，不要只用文字描述趋势。用户想看到可视化图表，不是文字描述。

## 使用时机
- 用户想看数据趋势（如"给我看看最近体重变化"）→ **必须画图**
- 用户想看数据统计（如"这周运动了多少"）→ **必须画图**
- 用户想对比数据（如"饮食热量对比"）→ **必须画图**
- 用户说"画个图"、"给我看看图表" → **必须画图**
- 任何涉及数据趋势、对比、统计的场景 → **必须画图**

## 生成流程
1. 先调用对应功能的 query 工具获取数据（如 query_body_records、query_diet_records）
2. 将查询结果整理为 data.values 数组
3. 根据数据特点选择合适的图表类型（趋势用折线图、对比用柱状图、占比用饼图）
4. 调用 generate_chart，传入完整的 Vega-Lite spec
5. 用简短文字配合图片说明（如"这是你的体重趋势图，整体呈下降趋势"）

## Vega-Lite 基础结构

spec 必须包含三个核心字段：
```json
{
  "data": { "values": [...] },
  "mark": "line",
  "encoding": { "x": {...}, "y": {...} }
}
```

- `data.values`: 内联数据数组，把查询到的记录直接放入
- `mark`: 图表类型（line/bar/point/area/pie 用 arc）
- `encoding`: 视觉通道映射（x 轴、y 轴、颜色等）

## 数据格式约定

### 日期字段
使用字符串格式 `"2024-01-15"`，在 encoding 中声明为 temporal 类型：
```json
"x": { "field": "date", "type": "temporal", "timeUnit": "yearmonthdate", "axis": { "format": "%m/%d" } }
```

### 数值字段
直接使用数值，声明为 quantitative 类型：
```json
"y": { "field": "weight", "type": "quantitative" }
```

## 常见图表示例

### 体重趋势折线图
```json
{
  "title": "体重变化趋势",
  "data": {
    "values": [
      {"date": "2024-03-01", "weight": 72.5},
      {"date": "2024-03-08", "weight": 71.8},
      {"date": "2024-03-15", "weight": 71.2}
    ]
  },
  "width": 400,
  "height": 250,
  "mark": {"type": "line", "point": true},
  "encoding": {
    "x": {"field": "date", "type": "temporal", "timeUnit": "yearmonthdate", "axis": {"format": "%m/%d", "title": "日期"}},
    "y": {"field": "weight", "type": "quantitative", "axis": {"title": "体重 (kg)"}},
    "tooltip": [{"field": "date"}, {"field": "weight", "format": ".1f"}]
  }
}
```

### 每日热量柱状图
```json
{
  "title": "每日饮食热量",
  "data": {
    "values": [
      {"date": "2024-03-11", "calories": 1850, "protein": 65},
      {"date": "2024-03-12", "calories": 2100, "protein": 72}
    ]
  },
  "width": 400,
  "height": 250,
  "mark": "bar",
  "encoding": {
    "x": {"field": "date", "type": "temporal", "timeUnit": "yearmonthdate", "axis": {"format": "%m/%d", "title": "日期"}},
    "y": {"field": "calories", "type": "quantitative", "axis": {"title": "热量 (kcal)"}},
    "tooltip": [{"field": "date"}, {"field": "calories"}, {"field": "protein"}]
  }
}
```

### 睡眠质量散点图
```json
{
  "title": "睡眠时长 vs 质量",
  "data": {
    "values": [
      {"date": "2024-03-11", "duration": 420, "quality": 4},
      {"date": "2024-03-12", "duration": 360, "quality": 3}
    ]
  },
  "width": 400,
  "height": 250,
  "mark": "point",
  "encoding": {
    "x": {"field": "duration", "type": "quantitative", "axis": {"title": "睡眠时长 (分钟)"}},
    "y": {"field": "quality", "type": "quantitative", "axis": {"title": "睡眠质量 (1-5)"}},
    "tooltip": [{"field": "date"}, {"field": "duration"}, {"field": "quality"}]
  }
}
```

### 运动类型分布饼图
```json
{
  "title": "运动类型分布",
  "data": {
    "values": [
      {"type": "跑步", "count": 12},
      {"type": "游泳", "count": 5},
      {"type": "健身", "count": 8}
    ]
  },
  "width": 300,
  "height": 300,
  "mark": {"type": "arc", "innerRadius": 50},
  "encoding": {
    "theta": {"field": "count", "type": "quantitative"},
    "color": {"field": "type", "type": "nominal", "legend": {"title": "运动类型"}},
    "tooltip": [{"field": "type"}, {"field": "count"}]
  }
}
```

### 多指标折线图（体重 + 体脂）
```json
{
  "title": "身体指标趋势",
  "data": {
    "values": [
      {"date": "2024-03-01", "metric": "体重", "value": 72.5},
      {"date": "2024-03-01", "metric": "体脂", "value": 22.1},
      {"date": "2024-03-08", "metric": "体重", "value": 71.8},
      {"date": "2024-03-08", "metric": "体脂", "value": 21.5}
    ]
  },
  "width": 400,
  "height": 250,
  "mark": "line",
  "encoding": {
    "x": {"field": "date", "type": "temporal", "timeUnit": "yearmonthdate", "axis": {"format": "%m/%d"}},
    "y": {"field": "value", "type": "quantitative"},
    "color": {"field": "metric", "type": "nominal"}
  }
}
```

## 注意事项
- **数据来源**：先用 query 工具查询数据，再构造 spec。不要编造数据。
- **数据量**：建议不超过 30 个数据点，太多会显得拥挤
- **宽度建议**：400-500px 适合手机查看，不要超过 600px
- **必须内联数据**：spec 中使用 `data.values` 直接嵌入数据，不要用 URL 引用
- **日期格式**：统一使用 `"YYYY-MM-DD"` 字符串格式
- **中文标题**：title、axis.title、legend.title 都可以用中文
- **先查询再画图**：当用户要查看趋势时，先用对应功能的 query 工具获取数据，再用本工具画图
