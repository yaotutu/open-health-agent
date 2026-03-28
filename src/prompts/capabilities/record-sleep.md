# 睡眠记录

## 工具
`record_sleep`

## 参数
| 参数 | 类型 | 说明 |
|------|------|------|
| duration | number | 睡眠时长 (分钟) |
| quality | number | 睡眠质量 (1-5) |
| bedTime | string | 入睡时间 (timestamp) |
| wakeTime | string | 醒来时间 (timestamp) |
| deepSleep | number | 深睡时长 (分钟) |
| note | string | 备注 |

## 使用时机
- 用户提到睡眠（如"昨晚睡得不好"、"今天睡了个懒觉"）
- 用户描述睡眠质量或时长
- 用户发送睡眠相关的截图或数据

## 注意事项
- duration 是核心信息，优先获取
- 用户说"睡了8个小时"时，转换为分钟（480）
- quality 如果用户没说，可以根据描述推断（"睡得很好"→4-5，"一般"→3，"没睡好"→1-2）
- bedTime 和 wakeTime 如果用户提到具体时间就记录
