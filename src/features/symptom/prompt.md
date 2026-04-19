# 症状与健康感受记录

## 工具
`record_symptom`、`update_symptom_record`、`query_symptom_records`、`resolve_symptom`

## 参数
| 参数 | 类型 | 说明 |
|------|------|------|
| description | string | 描述（必填） |
| severity | number | 严重程度 1-10（可选） |
| bodyPart | string | 身体部位（可选） |
| relatedType | string | 关联记录类型，如 diet、exercise（可选） |
| relatedId | number | 关联记录 ID（可选） |
| note | string | 备注（可选） |

## 适用范围
所有身体和心理的不适、感受、异常状态，统一用这一个工具记录：

- **具体症状**：头疼、胃不舒服、过敏、疼痛 → 填写 description + severity + bodyPart
- **模糊感受**：感觉压力大、最近疲劳、精神不好、焦虑 → 填写 description，severity 等可选
- **异常状态**：最近睡眠不好、容易累、注意力不集中 → 同上

不需要区分"这是症状还是观察"，只要用户表达了身体/心理的不适或异常，就用 record_symptom 记录。

## 关联记录
当用户提到不适可能与某个具体行为有关时：
1. 先记录关联的行为（如饮食 record_diet、运动 record_exercise）
2. 再调用 record_symptom，使用 relatedType 和 relatedId 建立关联

示例：
用户："刚吃完海鲜，胃有点不舒服"
→ 先 record_diet 记录海鲜，再 record_symptom 记录胃不适并关联该饮食记录

## 标记解决
用户说"好了"、"没事了"、"不疼了"时，使用 resolve_symptom 标记对应症状为已解决。
