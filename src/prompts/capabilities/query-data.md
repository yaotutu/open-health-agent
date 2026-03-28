# 数据查询

## 可用工具
| 工具 | 说明 |
|------|------|
| `query_body_records` | 查询身体数据记录 |
| `query_diet_records` | 查询饮食记录 |
| `query_symptom_records` | 查询症状记录 |
| `query_exercise_records` | 查询运动记录 |
| `query_sleep_records` | 查询睡眠记录 |
| `query_water_records` | 查询饮水记录 |

## 参数
| 参数 | 类型 | 说明 |
|------|------|------|
| startTime | string | 起始时间 (timestamp) |
| endTime | string | 结束时间 (timestamp) |
| limit | number | 返回条数限制（默认10） |

## 使用时机
- 用户提到一段时间的健康问题时，查询相关历史记录进行分析
- 需要历史数据来回答用户的问题或进行综合分析
- 用户主动询问历史记录（如"我这周吃了什么"、"最近体重变化怎么样"）

## 注意事项
- 查询工具返回的是原始记录数据，分析工作由你完成
- 根据用户提到的场景选择合适的查询工具和时间范围
- 如果用户说"最近"，默认查询最近7天的数据
- 如果用户说"这周/上周"，计算对应的时间范围
