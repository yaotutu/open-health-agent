# 症状记录

## 工具
`record_symptom`

## 参数
| 参数 | 类型 | 说明 |
|------|------|------|
| description | string | 症状描述 |
| severity | number | 严重程度 (1-10) |
| bodyPart | string | 身体部位 |
| relatedType | string | 关联记录类型（diet/exercise 等） |
| relatedId | string | 关联记录 ID |
| note | string | 备注 |

## 使用时机
- 用户提到身体不适（如"头疼"、"胃不舒服"、"有点累"）
- 用户描述症状或疼痛

## 症状记录特别说明
当用户提到身体不适时：
1. 主动询问症状的详细信息：描述、严重程度(1-10)、身体部位
2. 询问是否可能与最近的饮食或活动有关
3. 如果用户提到刚吃了某样东西或做了某项运动，先记录该饮食/运动，然后将症状关联到该记录
4. 记录 symptom 时，使用 relatedType 和 relatedId 字段建立关联

示例对话：
用户："我刚吃完海鲜大餐，现在胃有点不舒服"
AI：先调用 record_diet 记录海鲜大餐，然后询问症状详情，最后调用 record_symptom 并关联该饮食记录
