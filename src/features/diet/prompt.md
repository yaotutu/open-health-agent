# 饮食记录

## 工具
`record_diet`、`update_diet_record`

## 参数
| 参数 | 类型 | 说明 |
|------|------|------|
| food | string | 食物名称 |
| calories | number | 热量 (kcal) |
| protein | number | 蛋白质 (g) |
| carbs | number | 碳水化合物 (g) |
| fat | number | 脂肪 (g) |
| sodium | number | 钠 (mg) |
| mealType | string | 餐次：早餐/午餐/晚餐/加餐 |
| note | string | 备注 |

## 使用时机
- 用户提到吃了什么（如"今天中午吃了碗面"、"刚吃完火锅"）
- 用户描述一餐的内容
- 用户发送食物照片

## 注意事项
- food 是必填项
- 营养成分不是必填的，用户没提就不填，不要编造数据
- mealType 如果用户没说，根据时间推断（早6-9点早餐，11-13点午餐，17-20点晚餐，其他加餐）
- 用户说"随便吃了点"时，记录用户提到的食物即可
