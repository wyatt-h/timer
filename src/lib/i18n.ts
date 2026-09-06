import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const LANGUAGE_STORAGE_KEY = "timer:language";
export type AppLanguage = "en" | "zh";

const zh = {
  // Shared navigation and landing page
  "Timer — Every moment, perfectly timed": "Timer — 每一刻，精准掌控",
  "Every moment, perfectly timed": "每一刻，精准掌控",
  "Every moment, perfectly timed.": "每一刻，精准掌控。",
  "A focused, realtime event timer for speakers, panels, and whoever is keeping the room on schedule.":
    "一款专注的实时活动计时器，适用于演讲、圆桌讨论以及所有负责掌控现场节奏的人。",
  "Timer event countdown": "Timer 活动倒计时",
  "Skip to content": "跳到主要内容",
  "Main navigation": "主导航",
  "Timer home": "Timer 首页",
  Guide: "使用指南",
  Home: "首页",
  "How it works": "使用方法",
  "Product guide": "产品指南",
  "Every moment,": "每一刻，",
  "perfectly timed.": "精准掌控。",
  perfectly: "精准",
  "timed.": "掌控。",
  "Create or open an event": "创建或打开活动",
  "Create an event": "创建活动",
  "Open an event": "打开活动",
  "Open event": "打开活动",
  "Build the run of show, then choose a password for the event itself. No account, and nothing to sign up for.":
    "先编排活动流程，再为活动设置密码。无需账户，也无需注册。",
  "New event": "新建活动",
  "Import from CSV": "从 CSV 导入",
  "On this device": "此设备上的活动",

  // Product guide
  "Skip to guide": "跳到指南",
  "Guide navigation": "指南导航",
  Workflow: "工作流程",
  Experiences: "使用场景",
  FAQ: "常见问题",
  "Create event": "创建活动",
  "Guided product tour": "产品导览",
  "One clock. Every room.": "一个时钟，同步每个空间。",
  "One clock.": "一个时钟。",
  "Every room.": "同步每个空间。",
  "Build the run of show, control every transition, and keep the audience and Zoom meeting perfectly in step.":
    "编排活动流程、掌控每次转场，让现场观众和 Zoom 会议始终同步。",
  "Start the tour": "开始导览",
  "Open Timer": "打开 Timer",
  "No user account": "无需用户账户",
  "Per-event access": "每个活动独立访问",
  "Audience stays read-only": "观众始终只读",
  "For the operator": "面向操作员",
  "A focused live control room": "专注的实时控制室",
  "For the audience": "面向观众",
  "A fullscreen synchronized clock": "全屏同步时钟",
  "For the meeting": "面向会议",
  "A native Zoom indicator": "原生 Zoom 指示器",
  "The core workflow": "核心工作流程",
  "From an empty agenda to a room in sync.": "从空白议程到全场同步。",
  "Timer is organized around the way an event actually happens: prepare the plan, run it with confidence, then share only the views each person needs.":
    "Timer 按照活动的真实流程设计：先准备计划，自信地主持现场，再只向每个人分享他们需要的视图。",
  "Product tour stages": "产品导览阶段",
  Prepare: "准备",
  "Build a run of show everyone can trust.": "编排一份人人都能信赖的活动流程。",
  "Add individual speakers or multi-person panels, set durations, and reorder the agenda before the room goes live.":
    "添加单人演讲或多人圆桌讨论，设置时长，并在活动开始前调整议程顺序。",
  Run: "执行",
  "Keep the room moving without losing the plan.": "让现场顺畅推进，同时不偏离计划。",
  "Start, pause, reset, skip, or adjust time from one calm control room. Projected finish updates as the programme changes.":
    "在一个清晰的控制室中开始、暂停、重置、跳过或调整时间；预计结束时间会随流程变化自动更新。",
  Share: "分享",
  "Put the same clock everywhere it matters.": "让同一个时钟出现在每个需要它的地方。",
  "Open the fullscreen audience display, invite another controller, or publish the countdown in a Zoom meeting.":
    "打开全屏观众视图、邀请另一位操作员，或在 Zoom 会议中发布倒计时。",
  "Three experiences": "三种使用体验",
  "Everyone sees exactly what they need.": "每个人都能看到恰好需要的信息。",
  "The controller can change the event. The audience receives a clean read-only display. Zoom participants see the shared countdown without opening another window.":
    "操作员可以修改活动；观众看到简洁的只读画面；Zoom 参会者无需打开其他窗口即可看到共享倒计时。",
  "Event controller": "活动控制台",
  "Run the clock, edit what is coming next, share access, and watch every save reach the cloud.":
    "控制计时、编辑后续流程、共享访问权限，并确认每次保存都已同步到云端。",
  "Start · pause · reset": "开始 · 暂停 · 重置",
  "Draft and save": "草稿与保存",
  "Projected finish": "预计结束时间",
  "Audience display": "观众视图",
  "A high-contrast fullscreen countdown with local alarm choice and a clear overtime state.":
    "高对比度全屏倒计时，可在本地选择提示音，并清楚显示超时状态。",
  "Anonymous link": "匿名链接",
  "Read-only": "只读",
  "Local sound": "本地声音",
  "Zoom indicator": "Zoom 指示器",
  "Pair the event in a meeting and publish the live speaker countdown to every participant.":
    "在会议中配对活动，并向所有参会者发布演讲者的实时倒计时。",
  "Operator installs": "操作员安装",
  "Meeting-wide": "全体会议可见",
  "Opt-in sharing": "主动选择共享",
  "Built for live work": "为现场工作而生",
  "Powerful when needed. Quiet when it matters.": "需要时强大，关键时安静。",
  LIVE: "直播",
  "Control the clock without interrupting the room.": "无需打断现场即可掌控计时。",
  "Start, pause, reset, skip, and make precise time adjustments. The projected finish moves with every decision, so the operator always knows where the programme is heading.":
    "开始、暂停、重置、跳过并精确调整时间。预计结束时间会随每次操作变化，让操作员始终掌握活动进度。",
  "Edit safely during the show.": "活动进行中也能安全编辑。",
  "Upcoming changes stay in draft until Save Changes. Undo them instantly, and navigation pauses until the decision is resolved.":
    "后续修改会保留为草稿，直到选择“保存更改”。可随时撤销；在处理完修改前，流程跳转会暂时停用。",
  "Conflicts stay visible.": "冲突始终清晰可见。",
  "When two controllers edit at once, Timer asks which version to keep. Nothing is silently overwritten.":
    "当两位操作员同时编辑时，Timer 会询问保留哪个版本，不会静默覆盖任何内容。",
  "Cloud + local resilience": "云端与本地双重保障",
  "A weak connection does not erase the plan.": "网络不稳定也不会丢失计划。",
  "The controller keeps a local working copy, clearly reports its save state, and retries pending changes when the connection returns.":
    "控制台会保留本地工作副本，清楚显示保存状态，并在网络恢复后重试待处理的更改。",
  "Zoom meeting": "Zoom 会议",
  "In meeting": "会议中",
  "Connected · X7R4Q–Y90H9": "已连接 · X7R4Q–Y90H9",
  "Sync to Zoom": "同步到 Zoom",
  "Zoom integration": "Zoom 集成",
  "The countdown joins the meeting.": "让倒计时进入会议。",
  "Only the operator opens Timer. Once sharing is enabled, everyone sees the Dynamic Indicator—including its neutral, yellow, red, and overtime states.":
    "只需操作员打开 Timer。启用共享后，所有人都能看到动态指示器，包括正常、黄色、红色和超时状态。",
  "Create a Zoom code in the live control room.": "在实时控制室中创建 Zoom 代码。",
  "Open Timer inside the Zoom meeting.": "在 Zoom 会议中打开 Timer。",
  "Enter the code to connect the event.": "输入代码以连接活动。",
  "Select Sync to Zoom when you are ready to publish.": "准备发布时选择“同步到 Zoom”。",
  "Share control responsibly": "安全地共享控制权",
  "An event is its own secure workspace.": "每个活动都是独立安全的工作空间。",
  "There are no teams or user directories to manage. Each event has its own login and password, while temporary invitation links make it easy to bring another controller into the room.":
    "无需管理团队或用户目录。每个活动都有独立的登录名和密码，临时邀请链接则能方便地让另一位操作员加入。",
  "Audience links can never edit": "观众链接无法编辑",
  "Invitations expire after 24 hours": "邀请在 24 小时后过期",
  "Sessions are remembered per device": "每台设备会记住会话",
  "Invitation access can be revoked": "邀请权限可随时撤销",
  "Controller invitation": "操作员邀请",
  "Reusable · expires in 23h 58m": "可重复使用 · 23 小时 58 分钟后过期",
  "Copy link": "复制链接",
  Revoke: "撤销",
  "Good to know": "常见须知",
  "A few common questions.": "一些常见问题。",
  "Does the audience need an account?": "观众需要账户吗？",
  "No. The audience link is anonymous and read-only. Anyone with the link can open the synchronized display, but they cannot change the event.":
    "不需要。观众链接是匿名且只读的。任何拥有链接的人都能打开同步视图，但无法修改活动。",
  "Can another person help control the event?": "其他人可以协助控制活动吗？",
  "Yes. Create a reusable 24-hour invitation link from Event access. It signs the recipient into this event without revealing its password and can be revoked whenever you want.":
    "可以。在“活动访问”中创建一个 24 小时内可重复使用的邀请链接。接收者无需知道密码即可登录此活动，且你可以随时撤销邀请。",
  "What happens if two controllers edit at once?": "如果两位操作员同时编辑会怎样？",
  "Every save carries an event version. If two edits conflict, Timer keeps both versions visible and asks which one to use instead of silently overwriting somebody's work.":
    "每次保存都带有活动版本。如果两次编辑发生冲突，Timer 会保留两个可见版本并询问使用哪一个，而不会静默覆盖他人的工作。",
  "Does everyone in Zoom need to install Timer?": "Zoom 中的每个人都需要安装 Timer 吗？",
  "No. Only the operator opens the Timer Zoom App. Once the operator selects Sync to Zoom, the Dynamic Indicator is visible to everyone in that meeting.":
    "不需要。只有操作员需要打开 Timer Zoom 应用。选择“同步到 Zoom”后，会议中的所有人都能看到动态指示器。",
  "Will the timer survive a temporary network problem?": "临时网络故障会影响计时器吗？",
  "The controller keeps a local working copy and clearly shows its save state. Pending changes retry when connectivity returns, while audience displays keep deriving the countdown from its deadline.":
    "控制台会保留本地工作副本并清楚显示保存状态。网络恢复后会重试待处理的更改，观众视图则会继续根据截止时间计算倒计时。",
  "Ready when the room is.": "现场准备好，Timer 就准备好。",
  "Create the event, share the right view, and let every screen follow one authoritative clock.":
    "创建活动、分享合适的视图，让每块屏幕都跟随同一个权威时钟。",

  // Preview copy in the guide
  "Live · synced": "直播 · 已同步",
  "Now speaking": "正在发言",
  Running: "运行中",
  Pause: "暂停",
  "Up next": "接下来",
  Saved: "已保存",
  "Product story": "产品故事",
  "Customer panel": "客户圆桌讨论",
  "Closing remarks": "结束致辞",
  "3 speakers · 25 min": "3 位演讲者 · 25 分钟",
  "Event builder": "活动编辑器",
  "Friday showcase": "周五展示会",
  "42 min total": "共 42 分钟",
  "Opening story · Avery Chen": "开场故事 · Avery Chen",
  "Single speaker": "单人演讲",
  PANEL: "圆桌讨论",
  "+ Add speaker or panel": "+ 添加演讲者或圆桌讨论",
  "Live control room": "实时控制室",
  "Now speaking · Mina": "正在发言 · Mina",
  Reset: "重置",
  "18 min of programme left": "流程剩余 18 分钟",
  "Audience sound is local to this display": "观众声音仅在此显示设备上播放",
  "Fullscreen audience": "全屏观众视图",
  "Zoom synced": "Zoom 已同步",

  // Event creation and editing
  "Set access for new event": "设置新活动的访问方式",
  "Choose the login name and password. Timer validates and creates the event before opening its agenda, and you can use the same access on another device.":
    "选择登录名和密码。Timer 会先验证并创建活动，再打开议程；你也可以在其他设备上使用相同凭据。",
  "Creating the event…": "正在创建活动…",
  "Creating…": "正在创建…",
  "Edit event": "编辑活动",
  "Return to control": "返回控制台",
  "Start event": "开始活动",
  "Loading event editor": "正在加载活动编辑器",
  "Event details": "活动详情",
  "Event name": "活动名称",
  "Annual Leadership Summit": "年度领导力峰会",
  Date: "日期",
  "Choose a date": "选择日期",
  "Previous month": "上个月",
  "Next month": "下个月",
  Today: "今天",
  "Programme summary": "流程概览",
  "Agenda items": "议程项目",
  "Programme time": "流程时长",
  "Give the event a name before saving.": "请先为活动命名再保存。",
  "Fix the highlighted agenda problems before starting the event.": "请先修正突出显示的议程问题，再开始活动。",
  "Changes saved successfully": "更改已成功保存",
  "Unsaved changes": "有未保存的更改",
  "Save changes": "保存更改",
  "Save Changes": "保存更改",

  // Agenda builder
  "Run of show": "活动流程",
  item: "项",
  items: "项",
  "min total": "分钟（总计）",
  min: "分钟",
  Minutes: "分钟",
  Duration: "时长",
  "Nothing scheduled yet": "尚未安排内容",
  "Add a speaker or a panel to start building the run of show.": "添加演讲者或圆桌讨论，开始编排活动流程。",
  "Add speaker": "添加演讲者",
  "Add panel": "添加圆桌讨论",
  Speaker: "演讲者",
  Panel: "圆桌讨论",
  "Who is speaking": "发言人姓名",
  "Panel host": "圆桌主持人",
  "Who runs this panel": "圆桌主持人姓名",
  "Panel total": "圆桌总时长",
  Panelists: "圆桌嘉宾",
  "Default per panelist": "每位嘉宾默认时长",
  "Apply to all": "应用到全部",
  "Apply this duration to all current panelists": "将此时长应用到所有当前嘉宾",
  Used: "已用",
  Over: "超出",
  Left: "剩余",
  "No panelists yet. Add the first one below.": "尚无圆桌嘉宾。请在下方添加第一位。",
  "Add panelist": "添加嘉宾",
  "Remove panelist": "移除嘉宾",
  "A panel needs one panelist": "圆桌讨论至少需要一位嘉宾",
  "Remove item": "移除项目",
  "The host and every panelist on this item will be removed from the run of show.":
    "此项目的主持人和所有圆桌嘉宾都将从活动流程中移除。",
  "This speaker will be removed from the run of show.": "这位演讲者将从活动流程中移除。",
  "Keep it": "保留",
  Remove: "移除",
  "Enter a number of minutes": "请输入分钟数",
  "Must be at least 1 minute": "必须至少为 1 分钟",
  "That is longer than a day": "时长不能超过一天",
  "Panelist name is required": "请输入圆桌嘉宾姓名",
  "Speaker name is required": "请输入演讲者姓名",
  "Host name is required": "请输入主持人姓名",
  "That name is too long": "名称过长",
  "A panel needs at least one panelist": "圆桌讨论至少需要一位嘉宾",
  "Longer than the whole panel": "不能超过圆桌讨论总时长",
  "Add at least one agenda item": "请至少添加一个议程项目",

  // Access, import, and account-free authentication
  "Event login name": "活动登录名",
  "Event password": "活动密码",
  "Repeat the password": "再次输入密码",
  "Current password": "当前密码",
  "New password": "新密码",
  "Passwords match": "密码一致",
  "The two passwords do not match.": "两次输入的密码不一致。",
  "Use lowercase letters, numbers, and dashes only. No spaces or special characters.":
    "仅使用小写字母、数字和连字符；不能包含空格或特殊字符。",
  "Use lowercase letters, numbers, and single dashes only.": "仅使用小写字母、数字和单个连字符。",
  "Enter an event login name.": "请输入活动登录名。",
  "Lowercase letters, numbers, and dashes only.": "仅使用小写字母、数字和连字符。",
  "Converted to lowercase and removed unsupported characters.": "已转换为小写并移除不支持的字符。",
  "Converted to lowercase.": "已转换为小写。",
  "Removed unsupported characters.": "已移除不支持的字符。",
  "This lowercase login name and password open the event on any device. There is no account, so choose credentials you can share with the people running it.":
    "使用此小写登录名和密码可在任何设备上打开活动。这里没有用户账户，请选择便于与活动工作人员共享的凭据。",
  "Enter the event login name and password.": "请输入活动登录名和密码。",
  "Checking…": "正在验证…",
  "Password changed. Every other device has been signed out.": "密码已更改，其他所有设备均已退出登录。",
  "The invitation is ready, but this browser could not copy it.": "邀请已创建，但此浏览器无法复制链接。",
  "Invitation revoked. The link can no longer be used.": "邀请已撤销，此链接无法再使用。",
  "Event access": "活动访问",
  "Login name:": "登录名：",
  "This link can be used multiple times for 24 hours. Creating another invitation revokes this one.":
    "此链接可在 24 小时内重复使用。创建新邀请会撤销当前邀请。",
  Copied: "已复制",
  "Revoking…": "正在撤销…",
  Close: "关闭",
  "Changing…": "正在更改…",
  "Change password": "更改密码",
  Cancel: "取消",
  "Creating invitation…": "正在创建邀请…",
  "Create invitation link": "创建邀请链接",
  "Change the password": "更改密码",
  "Sign out of this event": "退出此活动",
  "Delete this event": "删除此活动",
  "Sign in again to continue": "请重新登录以继续",
  "This device is no longer signed in to that event.": "此设备已不再登录该活动。",
  "The event has not been deleted.": "活动并未被删除。",
  "Your unsaved changes are still saved on this device and will be sent once you sign in.":
    "未保存的更改仍保留在此设备上，重新登录后将自动发送。",
  "Go home": "返回首页",
  "Cancel the import": "取消导入",
  "The import stopped before every event was created. These events are ready:":
    "导入在所有活动创建完成前停止。以下活动已准备就绪：",
  Done: "完成",
  "Give each imported event a login name made from lowercase letters, numbers, and dashes. Use that login name and this password to open it on another device.":
    "为每个导入的活动设置由小写字母、数字和连字符组成的登录名。可使用该登录名和此密码在其他设备上打开活动。",
  "Import events from CSV": "从 CSV 导入活动",
  Columns: "列说明",
  required: "必填",
  Example: "示例",
  "One row per speaker. Rows that share an": "每位演讲者占一行。具有相同",
  "become one event, and rows that share an": "的行会合并为一个活动；具有相同",
  "become one agenda item — that is how a panel gets several panelists.":
    "的行会合并为一个议程项目——圆桌讨论正是通过这种方式包含多位嘉宾。",
  "Rows sharing a name become one event.": "同名的行会合并为一个活动。",
  "“single” or “panel”.": "填写“single”或“panel”。",
  "Position in the run of show. Groups panelists.": "活动流程中的顺序，同时用于归组圆桌嘉宾。",
  "The speaker, or one panelist per row.": "演讲者；圆桌讨论则每行填写一位嘉宾。",
  "Who runs a panel. Shown as “Panel led by …”.": "圆桌主持人，将显示为“由…主持的圆桌讨论”。",
  "Length of a single talk. Default 10.": "单人演讲时长，默认为 10。",
  "YYYY-MM-DD. Taken from the first row.": "YYYY-MM-DD，取自第一行。",
  "Whole panel slot. Default: sum of panelists.": "圆桌讨论总时长，默认为所有嘉宾时长之和。",
  "One panelist's time.": "单位圆桌嘉宾的时长。",
  "Fallback per panelist. Default 5.": "每位嘉宾的备用默认值，默认为 5。",
  "A 12-minute talk, then a 30-minute panel of two, then an 8-minute talk.":
    "一场 12 分钟的演讲，接着是两人参加的 30 分钟圆桌讨论，最后是一场 8 分钟的演讲。",
  "Example CSV contents": "CSV 内容示例",
  "Both panel rows repeat": "两条圆桌记录都重复填写了「",
  "2, so they join the same panel.": "」2，因此会归入同一个圆桌讨论。",
  "so they join the same panel.": "」，因此会归入同一个圆桌讨论。",
  Leave: "如果完全省略「",
  "out entirely and every row becomes its own item.": "」，则每一行都会成为独立项目。",
  "Agenda items have no titles — a speaker's name is the label.": "议程项目没有单独标题——演讲者姓名就是标签。",
  "Column order does not matter, and extra columns are ignored.": "列的顺序不限，多余列会被忽略。",
  "Download template": "下载模板",
  "Drop a CSV here": "将 CSV 拖到此处",
  "Choose a file": "选择文件",
  "That file": "该文件",
  "could not be imported.": "无法导入。",
  ready: "已就绪",
  Import: "导入",
  "The CSV could not be read.": "无法读取 CSV。",
  "The CSV needs a header and at least one data row.": "CSV 需要表头和至少一行数据。",
  "No event names were found in the CSV.": "CSV 中没有找到活动名称。",

  // Save and connection states
  "Up to date": "已是最新",
  "No unsaved changes.": "没有未保存的更改。",
  Saving: "正在保存",
  "Sending changes to the cloud.": "正在将更改发送到云端。",
  "Every change is stored in the cloud.": "所有更改均已存储在云端。",
  Offline: "离线",
  "Changes are kept on this device and will be sent when the connection returns.":
    "更改会保留在此设备上，并在网络恢复后发送。",
  "Not saved": "未保存",
  "The server refused this change. It is still on this device, but retrying as-is will not help.":
    "服务器拒绝了此更改。更改仍保留在此设备上，但直接重试无法解决问题。",
  Conflict: "冲突",
  "This event was changed on another device. The newer version has been loaded.":
    "此活动已在另一台设备上更改，较新的版本已加载。",
  "Sign in again": "重新登录",
  "This device is no longer signed in to the event. Unsaved changes are kept until it is.":
    "此设备已退出活动；未保存的更改会一直保留，直到重新登录。",
  Retry: "重试",
  Reconnecting: "正在重新连接",
  "Reconnecting…": "正在重新连接…",

  // Live control room
  "Loading the control room": "正在加载控制室",
  "We couldn't find that event": "找不到该活动",
  "Sign in with the event login name and password to open it.": "请使用活动登录名和密码打开它。",
  "Unsaved modifications": "未保存的修改",
  "Undo Changes": "撤销更改",
  "No unsaved changes": "没有未保存的更改",
  "Another controller changed the run of show while you were editing. Save your version to replace it, or load their latest version.":
    "你编辑期间，另一位操作员更改了活动流程。保存你的版本以替换它，或加载对方的最新版本。",
  "Load latest version": "加载最新版本",
  Complete: "已完成",
  "On now": "正在进行",
  Audience: "观众视图",
  Part: "第",
  of: "段，共",
  "Total time": "总时长",
  Host: "主持人",
  total: "总计",
  "Go to": "跳转到",
  "Audience link copied to clipboard": "观众链接已复制到剪贴板",
  "You have unresolved changes. Save or undo them before moving to another part.":
    "你还有未处理的更改。请先保存或撤销，再跳转到其他部分。",
  Edit: "编辑",
  "Open audience": "打开观众视图",
  "Copy audience link": "复制观众链接",
  "Show the run of show": "显示活动流程",
  "Focus on the timer": "专注显示计时器",
  "Show run of show": "显示活动流程",
  "Focus mode": "专注模式",
  "This event changed on another device while you had unsaved modifications. Choose which version should continue.":
    "你有未保存的修改时，此活动已在另一台设备上发生变化。请选择要继续使用的版本。",
  "Loading that version…": "正在加载该版本…",
  "Use the other version": "使用另一版本",
  "Keeping your changes…": "正在保留你的更改…",
  "Keep my changes": "保留我的更改",
  Ended: "已结束",
  "Auto-stopped": "已自动停止",
  Paused: "已暂停",
  Ready: "准备就绪",
  "Current panel": "当前圆桌讨论",
  "Speaker progress": "演讲进度",
  "Panel progress": "圆桌讨论进度",
  "Pause speaker": "暂停演讲者计时",
  "Start speaker": "开始演讲者计时",
  "Panel auto-stopped": "圆桌讨论已自动停止",
  "Pause panel": "暂停圆桌讨论",
  "Start panel": "开始圆桌讨论",
  "Panel remaining": "圆桌讨论剩余时间",
  "Adjust the panel total": "调整圆桌讨论总时长",
  "Pause timer": "暂停计时器",
  "Start timer": "开始计时器",
  "Remove one minute": "减少一分钟",
  "Remove fifteen seconds": "减少十五秒",
  "Add fifteen seconds": "增加十五秒",
  "Add one minute": "增加一分钟",
  "Reset current topic": "重置当前环节",
  "Reset the current topic?": "重置当前环节？",
  "of programme left": "流程剩余",
  Previous: "上一个",
  "First part": "第一个环节",
  "Next panelist": "下一位嘉宾",
  "Next part": "下一个环节",
  "Last part": "最后一个环节",
  "Previous part": "上一个环节",
  "Save or undo changes before moving": "请先保存或撤销更改再跳转",
  "Skip the rest of this panel": "跳过本圆桌讨论的剩余内容",
  "Skip the rest of the panel": "跳过圆桌讨论剩余内容",
  "Zoom code": "Zoom 代码",
  "Copy the Zoom code for this event": "复制此活动的 Zoom 代码",
  "Event Zoom code": "活动 Zoom 代码",
  "Copy Zoom code": "复制 Zoom 代码",
  "Paste this into the Timer app inside a Zoom meeting to show the countdown to every participant.":
    "将此代码粘贴到 Zoom 会议中的 Timer 应用，以向所有参会者显示倒计时。",
  "Create Zoom code": "创建 Zoom 代码",
  "Zoom code copied to clipboard": "Zoom 代码已复制到剪贴板",
  "Coming up": "即将开始",
  "Reset topic": "重置环节",
  "The run of show, its audience link, and its controller credentials are removed for everyone. This cannot be undone.":
    "活动流程、观众链接和操作员凭据将对所有人永久删除。此操作无法撤销。",
  "Delete event": "删除活动",
  "The event was not deleted. Nothing has changed — try again when the connection is back.":
    "活动未被删除，任何内容都没有变化。请在网络恢复后重试。",
  "End this event?": "结束此活动？",
  "Every audience display switches to the completed screen. You can start the event again afterwards.":
    "所有观众视图都会切换到活动完成页面。之后仍可重新开始活动。",
  "End event": "结束活动",
  "Signing out did not complete, so this device may still be signed in.": "退出登录未完成，此设备可能仍处于登录状态。",
  "This event was changed somewhere else": "此活动已在其他位置更改",
  "Your unsaved changes are still here and the other version is stored. Nothing has been overwritten — choose which one to keep.":
    "你未保存的更改仍在此处，另一版本也已保留。没有任何内容被覆盖，请选择要保留的版本。",
  "overtime limit reached.": "已达到超时上限。",
  "overtime limit reached. Reset or add time to continue.": "已达到超时上限。请重置或增加时间以继续。",
  "Password for": "以下活动的密码：",
  "This device is no longer signed in to": "此设备已不再登录",
  "Those credentials belong to": "这些凭据属于",
  ". Opening it instead…": "，正在改为打开该活动…",
  "That is still being worked out. Wait for it to finish, then choose again.":
    "该操作仍在处理中。请等待完成后再选择。",
  "Something changed here while that was loading, so nothing was discarded. Choose again.":
    "加载期间此处发生了变化，因此没有丢弃任何内容。请重新选择。",
  "There are unsaved changes on this device. Save them, or sign out again to discard them.":
    "此设备上有未保存的更改。请先保存，或再次退出以放弃这些更改。",
  "Date not set": "未设置日期",
  "Untitled event": "未命名活动",

  // Audience display and sounds
  "Waiting for the event": "等待活动开始",
  "Not live yet.": "尚未开始。",
  Waiting: "等待中",
  "Event complete": "活动已完成",
  "Panel in progress": "圆桌讨论进行中",
  "Turn sound off on this display": "关闭此显示设备的声音",
  "Sound on": "声音已开启",
  "Enable & test sound": "启用并测试声音",
  "Alarm sound": "提示音",
  "Select a sound or replay it with the preview button.": "选择提示音，或使用预览按钮重新播放。",
  "Exit fullscreen": "退出全屏",
  Fullscreen: "全屏",
  "Time elapsed for the current speaker": "当前演讲者已用时间",
  "Next up": "下一位",
  "Final item": "最后一项",
  "Synced live": "实时同步",
  "Feather bell": "轻柔铃声",
  "One very soft note with a long fade.": "一声非常轻柔、缓慢淡出的铃音。",
  "Gentle rising chime": "轻柔上扬音",
  "Two quiet notes with a friendly lift.": "两声安静而明快的上扬提示音。",
  "Warm marimba": "温暖木琴",
  "A short, rounded wooden tone.": "短促而圆润的木质音色。",
  "Airy glass": "空灵玻璃音",
  "A delicate, brighter shimmer.": "细腻而明亮的闪烁音色。",
  "Soft double tap": "轻柔双击音",
  "Two muted taps of the same note.": "同一音高的两声柔和敲击。",

  // Zoom app
  "Timer for Zoom": "Zoom 版 Timer",
  "Not connected": "未连接",
  Connecting: "正在连接",
  "Code not recognised": "无法识别代码",
  Connected: "已连接",
  "Checking Zoom": "正在检查 Zoom",
  "Browser preview": "浏览器预览",
  "Not in a meeting": "不在会议中",
  "Client unsupported": "客户端不受支持",
  "Zoom error": "Zoom 错误",
  "Open the event in the Timer control room, create its Zoom code, and paste it here.":
    "在 Timer 控制室中打开活动，创建 Zoom 代码，然后粘贴到此处。",
  Connect: "连接",
  "Looking for that event…": "正在查找该活动…",
  "No event matched this code. Check it in the control room, or create a new one.":
    "没有活动与此代码匹配。请在控制室中检查，或创建新代码。",
  "This deployment has no Supabase connection, so a code cannot be looked up.":
    "此部署未连接 Supabase，因此无法查询代码。",
  Disconnect: "断开连接",
  "Meeting indicator": "会议指示器",
  "Everyone in this meeting can see this timer.": "此会议中的所有人都能看到此计时器。",
  "Stop sharing timer": "停止共享计时器",
  "Waiting for the timer to start. The indicator appears when it is running.":
    "正在等待计时器开始。运行后将显示指示器。",
  "Nothing is shared with the meeting yet.": "目前尚未向会议共享任何内容。",
  "Cancel sharing": "取消共享",
  "Open this page from the Timer app inside a Zoom meeting to publish an indicator.":
    "请从 Zoom 会议内的 Timer 应用打开此页面，以发布指示器。",
  "Join a meeting or webinar, then re-check below.": "加入会议或网络研讨会，然后在下方重新检查。",
  "This Zoom client does not support dynamic indicators.": "此 Zoom 客户端不支持动态指示器。",
  "Zoom is not ready yet.": "Zoom 尚未准备就绪。",
  "Preview only": "仅预览",
  "There is no Zoom client on this page, so the SDK cannot be configured. Everything above still works as a read-only preview of what the meeting would be shown.":
    "此页面没有 Zoom 客户端，因此无法配置 SDK。上方内容仍可作为会议画面的只读预览。",
  Diagnostics: "诊断信息",
  "Running context": "运行环境",
  Product: "产品",
  "Zoom client": "Zoom 客户端",
  Unsupported: "不支持的能力",
  none: "无",
  "Last command": "上次命令",
  "none yet": "暂无",
  "Last Zoom event": "上次 Zoom 事件",
  "Re-check Zoom": "重新检查 Zoom",
  "Read Zoom state": "读取 Zoom 状态",
  "That is not a complete ten-character code.": "这不是完整的十字符代码。",
  "Zoom returned no indicator.": "Zoom 未返回指示器。",
  "The Zoom Apps SDK is not supported by this browser": "此浏览器不支持 Zoom Apps SDK",
  "Unknown Zoom error": "未知的 Zoom 错误",
  "Zoom is not ready to publish an indicator": "Zoom 尚未准备好发布指示器",
  "Zoom SDK is not configured": "尚未配置 Zoom SDK",

  // Invitations, missing pages, and API errors
  "Opening your event…": "正在打开活动…",
  "This invitation remains available for 24 hours.": "此邀请在 24 小时内有效。",
  "Invitation unavailable": "邀请不可用",
  "Try again": "重试",
  "This invitation link is incomplete.": "此邀请链接不完整。",
  "404 · Time out": "404 · 页面超时",
  "This page isn't on the run of show.": "此页面不在活动流程中。",
  "This page isn't": "此页面不在",
  "on the run of show.": "活动流程中。",
  "The address may be incomplete, expired, or moved. Your events are still safe—return home to create or open one.":
    "该地址可能不完整、已过期或已移动。你的活动仍然安全，请返回首页创建或打开活动。",
  "Return home": "返回首页",
  "View product guide": "查看产品指南",
  "That request could not be understood.": "无法理解该请求。",
  "That event login name and password do not match.": "活动登录名和密码不匹配。",
  "That invitation link has expired or has already been used.": "邀请链接已过期或已被使用。",
  "Sign in to this event again.": "请重新登录此活动。",
  "This session is not for that event.": "当前会话不属于该活动。",
  "That event could not be found.": "找不到该活动。",
  "This event changed somewhere else. Reloading the latest version.": "此活动已在其他位置更改，正在加载最新版本。",
  "That event login name is already used. Choose a different one.": "该活动登录名已被使用，请选择其他名称。",
  "Too many attempts. Wait a moment and try again.": "尝试次数过多，请稍后重试。",
  "Event storage is not configured.": "尚未配置活动存储。",
  "Something went wrong saving that.": "保存时出现问题。",
  "Something went wrong.": "出现了一些问题。",
  "No connection. Changes are kept on this device until it returns.": "网络未连接。更改会保留在此设备上，直到网络恢复。",
  "That did not work.": "操作未成功。",
} satisfies Record<string, string>;

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: {} },
      zh: { translation: zh },
    },
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en", "zh"],
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export function normalizeLanguage(language: string | undefined): AppLanguage {
  return language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function appLocale(language: AppLanguage) {
  return language === "zh" ? "zh-CN" : "en-US";
}

function dynamicChinese(source: string): string | null {
  let match: RegExpMatchArray | null;

  if ((match = source.match(/^Panelist (\d+)$/))) return `圆桌嘉宾 ${match[1]}`;
  if ((match = source.match(/^Speaker (\d+)$/))) return `演讲者 ${match[1]}`;
  if ((match = source.match(/^Panel (\d+)$/))) return `圆桌讨论 ${match[1]}`;
  if ((match = source.match(/^Panel led by (.+)$/))) return `由 ${match[1]} 主持的圆桌讨论`;
  if ((match = source.match(/^(.+)\*$/))) return `${translateText(match[1], "zh")}*`;
  if ((match = source.match(/^(Prepare|Run|Share): (.+)$/))) {
    return `${translateText(match[1], "zh")}：${translateText(match[2], "zh")}`;
  }
  if ((match = source.match(/^(.+) · (\d+(?:\.\d+)?) min$/))) return `${match[1]} · ${match[2]} 分钟`;
  if ((match = source.match(/^(.+), (.+) and (\d+) more$/))) {
    return `${match[1]}、${match[2]}，另有 ${match[3]} 位`;
  }
  if ((match = source.match(/^(\d+(?:\.\d+)?) min$/))) return `${match[1]} 分钟`;
  if ((match = source.match(/^(\d+(?:\.\d+)?) hr$/))) return `${match[1]} 小时`;
  if ((match = source.match(/^(\d+(?:\.\d+)?) hr (\d+(?:\.\d+)?) min$/))) {
    return `${match[1]} 小时 ${match[2]} 分钟`;
  }
  if ((match = source.match(/^(\d+) remaining$/))) return `剩余 ${match[1]} 项`;
  if ((match = source.match(/^(\d+) upcoming$/))) return `${match[1]} 项待进行`;
  if ((match = source.match(/^(\d+) of (\d+)$/))) return `${match[1]}/${match[2]}`;
  if ((match = source.match(/^Part (\d+) of (\d+)$/))) return `第 ${match[1]} 段，共 ${match[2]} 段`;
  if ((match = source.match(/^(\d+) items? · (\d+(?:\.\d+)?) min total$/))) {
    return `共 ${match[1]} 项 · ${match[2]} 分钟`;
  }
  if ((match = source.match(/^(\d+) items? · (.+)$/))) {
    return `${match[1]} 项 · ${translateText(match[2], "zh")}`;
  }
  if ((match = source.match(/^(.+) total$/))) return `共 ${translateText(match[1], "zh")}`;
  if ((match = source.match(/^(\d+) minutes?$/))) return `${match[1]} 分钟`;
  if ((match = source.match(/^(\d+) seconds?$/))) return `${match[1]} 秒`;
  if ((match = source.match(/^(\d+) minutes? (\d+) seconds? remaining$/))) {
    return `剩余 ${match[1]} 分钟 ${match[2]} 秒`;
  }
  if ((match = source.match(/^(\d+) minutes? remaining$/))) return `剩余 ${match[1]} 分钟`;
  if ((match = source.match(/^(\d+) seconds? remaining$/))) return `剩余 ${match[1]} 秒`;
  if ((match = source.match(/^(\d+) minutes? (\d+) seconds? over time$/))) {
    return `已超时 ${match[1]} 分钟 ${match[2]} 秒`;
  }
  if ((match = source.match(/^(\d+) minutes? over time$/))) return `已超时 ${match[1]} 分钟`;
  if ((match = source.match(/^(\d+) seconds? over time$/))) return `已超时 ${match[1]} 秒`;
  if (source === "zero seconds remaining") return "剩余 0 秒";
  if (source === "zero seconds over time") return "已超时 0 秒";
  if ((match = source.match(/^Auto-stopped after (.+) overtime$/))) return `超时 ${translateText(match[1], "zh")}后已自动停止`;
  if ((match = source.match(/^(.+) overtime limit reached\. Reset or add time to continue\.$/))) {
    return `已达到 ${translateText(match[1], "zh")}的超时上限。请重置或增加时间以继续。`;
  }
  if ((match = source.match(/^(.+) overtime limit reached\.$/))) return `已达到 ${translateText(match[1], "zh")}的超时上限。`;
  if ((match = source.match(/^(.+) of programme left$/))) {
    return `流程剩余 ${translateText(match[1], "zh")}`;
  }
  if ((match = source.match(/^Name of panelist (\d+)$/))) return `圆桌嘉宾 ${match[1]} 的姓名`;
  if ((match = source.match(/^Minutes for (.+)$/))) return `${match[1]} 的分钟数`;
  if ((match = source.match(/^Total minutes for (.+)$/))) return `${match[1]} 的总分钟数`;
  if ((match = source.match(/^Host of (.+)$/))) return `${match[1]} 的主持人`;
  if ((match = source.match(/^Default minutes per panelist in (.+)$/))) return `${match[1]} 中每位嘉宾的默认分钟数`;
  if ((match = source.match(/^Adjust time for (.+)$/))) return `调整 ${match[1]} 的时间`;
  if ((match = source.match(/^Reorder (.+)\. Press space, then use the arrow keys\.$/))) {
    return `重新排列 ${match[1]}。按空格键，然后使用方向键。`;
  }
  if ((match = source.match(/^Reorder (.+)\. Hold Alt and press the up or down arrow to move (?:it|them)\.$/))) {
    return `重新排列 ${match[1]}。按住 Alt 并按上或下方向键移动。`;
  }
  if ((match = source.match(/^Name of (.+) in (.+)$/))) return `${match[2]} 中${match[1]}的姓名`;
  if ((match = source.match(/^Remove (.+)$/))) return `移除 ${match[1]}`;
  if ((match = source.match(/^Remove (.+)\?$/))) return `移除 ${match[1]}？`;
  if ((match = source.match(/^Delete (.+)\?$/))) return `删除 ${match[1]}？`;
  if ((match = source.match(/^Choose alarm sound\. Current: (.+)$/))) return `选择提示音。当前：${translateText(match[1], "zh")}`;
  if ((match = source.match(/^Select (.+)$/))) return `选择${translateText(match[1], "zh")}`;
  if ((match = source.match(/^Preview (.+)$/))) return `预览${translateText(match[1], "zh")}`;
  if ((match = source.match(/^Password for (\d+) events?$/))) return `${match[1]} 个活动的密码`;
  if ((match = source.match(/^Importing (\d+) events?…$/))) return `正在导入 ${match[1]} 个活动…`;
  if ((match = source.match(/^Import (\d+) events?$/))) return `导入 ${match[1]} 个活动`;
  if ((match = source.match(/^(\d+) events? imported$/))) return `已导入 ${match[1]} 个活动`;
  if ((match = source.match(/^(\d+) events? ready$/))) return `${match[1]} 个活动已就绪`;
  if ((match = source.match(/^(\d+) items?$/))) return `${match[1]} 项`;
  if ((match = source.match(/^(.+) login name$/))) return `${match[1]} 的登录名`;
  if ((match = source.match(/^At least (\d+) characters\.$/))) return `至少 ${match[1]} 个字符。`;
  if ((match = source.match(/^Use at least (\d+) characters\.$/))) return `请至少使用 ${match[1]} 个字符。`;
  if ((match = source.match(/^Use (\d+) characters or fewer\.$/))) return `请勿超过 ${match[1]} 个字符。`;
  if ((match = source.match(/^At least (\d+) characters\. Spaces count and are kept exactly as typed\.$/))) {
    return `至少 ${match[1]} 个字符。空格也计入字符数，并会按输入原样保留。`;
  }
  if ((match = source.match(/^New password: (.+)$/))) return `新密码：${translateText(match[1], "zh")}`;
  if ((match = source.match(/^Missing required columns: (.+)$/))) return `缺少必填列：${match[1]}`;
  if ((match = source.match(/^Panelists total (.+) min, which is (.+) min over the (.+) min panel\.$/))) {
    return `圆桌嘉宾共 ${match[1]} 分钟，比圆桌讨论的 ${match[3]} 分钟超出 ${match[2]} 分钟。`;
  }
  if ((match = source.match(/^Added (.+) to the (speaker|panel) timer\.$/))) {
    return `已为${match[2] === "panel" ? "圆桌讨论" : "演讲者"}计时器增加${translateText(match[1], "zh")}。`;
  }
  if ((match = source.match(/^Removed (.+) from the (speaker|panel) timer\.$/))) {
    return `已从${match[2] === "panel" ? "圆桌讨论" : "演讲者"}计时器减少${translateText(match[1], "zh")}。`;
  }
  if ((match = source.match(/^This device is no longer signed in to (.+)\.$/))) return `此设备已不再登录 ${match[1]}。`;
  if ((match = source.match(/^Those credentials belong to (.+)\. Opening it instead…$/))) return `这些凭据属于 ${match[1]}，正在改为打开该活动…`;
  if ((match = source.match(/^This returns (.+) to (.+) and pauses the timer for every connected display\.$/))) {
    return `这会将 ${match[1]} 恢复到 ${match[2]}，并暂停所有已连接显示设备上的计时器。`;
  }
  if ((match = source.match(/^(\d+):(\d{2}) (AM|PM)$/))) return `${match[3] === "AM" ? "上午" : "下午"}${match[1]}:${match[2]}`;
  if ((match = source.match(/^Zoom said: (.+)$/))) return `Zoom 返回：${match[1]}`;
  if ((match = source.match(/^Zoom holds: (.+)$/))) return `Zoom 当前状态：${match[1]}`;
  if ((match = source.match(/^(.+) \(code (.+)\)$/))) return `${match[1]}（代码 ${match[2]}）`;
  if ((match = source.match(/^(.+)\. ((?:zero seconds|\d+ minutes?(?: \d+ seconds?)?|\d+ seconds?) (?:remaining|over time))\.$/))) {
    const prefix = match[1]
      .split(". ")
      .map((part) => translateText(part, "zh"))
      .join("。");
    return `${prefix}。${translateText(match[2], "zh")}。`;
  }

  return null;
}

/** Translate an existing English UI string. */
export function translateText(value: string, language = normalizeLanguage(i18n.resolvedLanguage)) {
  if (language === "en" || !value.trim()) return value;
  const source = value.trim().replace(/\s+/g, " ");
  const exact = i18n.getResource("zh", "translation", source);
  const translated = typeof exact === "string" ? exact : dynamicChinese(source) ?? source;
  return translated;
}

export default i18n;
