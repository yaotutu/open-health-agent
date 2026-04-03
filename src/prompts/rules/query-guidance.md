# 数据查询

## 极简查询工具（始终可用）
以下工具无参数，默认返回最近数据：
- `get_recent_body` — 最近7天身体数据
- `get_recent_diet` — 最近7天饮食记录
- `get_recent_sleep` — 最近7天睡眠记录
- `get_recent_exercise` — 最近7天运动记录
- `get_recent_water` — 最近7天饮水记录
- `get_recent_symptoms` — 最近7天症状记录
- `get_recent_medications` — 最近正在使用的药物
- `get_recent_chronic` — 活跃的慢性病追踪
- `get_recent_observations` — 最近7天健康观察
- `list_heartbeat_tasks` — 心跳任务列表
- `list_cron_jobs` — 定时任务列表

## 精确查询（需要 load_skill）
如果用户需要特定时间范围的数据（如"上周吃了什么"、"上个月的体重变化"）：
1. 先调用 `load_skill` 加载对应功能模块
2. 使用带参数的完整查询工具（支持 startTime/endTime/limit）

## 使用时机
- 用户提到一段时间的健康问题时，先用极简查询工具获取最近数据
- 需要精确时间范围时，再 load_skill 获取完整查询工具
- 如果用户说"最近"，默认查询最近7天的数据
- 如果用户说"这周/上周"，计算对应的时间范围
