# 运动记录

## 工具
`record_exercise`

## 参数
| 参数 | 类型 | 说明 |
|------|------|------|
| type | string | 运动类型 |
| duration | number | 时长 (分钟) |
| calories | number | 消耗热量 (kcal) |
| heartRateAvg | number | 平均心率 (bpm) |
| heartRateMax | number | 最大心率 (bpm) |
| distance | number | 距离 (km) |
| note | string | 备注 |

## 使用时机
- 用户提到运动（如"今天跑了5公里"、"去健身房练了一个小时"）
- 用户描述运动内容或效果
- 用户发送运动相关的截图或数据

## 注意事项
- type 和 duration 是核心信息，优先获取
- calories、heartRate、distance 不是必填的，用户没提就不填
- 运动类型要具体（如"跑步"而不是"运动"、"游泳"而不是"锻炼"）
