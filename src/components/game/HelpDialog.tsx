'use client';
// ============ 世界法典（原 HelpDialog 重设计） ============
// 五标签知识体系：入门（新玩家 5 分钟上手）/ 快捷键 / 世界系统（41 轮机制按域归类）/ 神谕与机制 / 更新日志
// 视觉：黑锌底 + amber 点缀 + 像素风 border-2 硬阴影；首次打开默认「入门」标签
import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { sfx } from '@/lib/game/sfx';
import { getKeymapByGroup } from '@/lib/ui/keymap';
import { CHANGELOG, GAME_VERSION } from '@/lib/game/version';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen, Hand, Sparkles, Eye, FastForward, Save, Keyboard, Crown, Swords, PawPrint, Dna, Network,
  Mountain, Flame, Gem, BrainCircuit, LayoutGrid, ChevronRight, Zap, FlaskConical, Layers, Smartphone,
} from 'lucide-react';

// ---------------- 入门：核心玩法（新玩家） ----------------
const BASICS: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Hand,
    title: '这是上帝沙盒',
    desc: '你是这个世界唯一的神——山川湖海、万物生灵、文明兴亡，皆随你一念而起，也随你一念而灭。',
  },
  {
    icon: Sparkles,
    title: '放置生物',
    desc: '底部工具栏「智慧生物」里选人类、精灵、矮人或兽人，点到草地上——他们会自动建立王国、扩张领土、建造房屋、繁衍生息。',
  },
  {
    icon: Flame,
    title: '降下神力',
    desc: '「神力」与「天灾」标签页是你全部的权柄：闪电、陨石、核弹、龙卷风、瘟疫……也可以用治疗与绿洲抚平大地的创伤。',
  },
  {
    icon: Eye,
    title: '观察文明',
    desc: '顶栏各按钮打开王国榜、文明详情、世界纪事——战争、科技、政变与传奇一目了然；点选任意单位或长按地面，可查看它的一生。',
  },
  {
    icon: FastForward,
    title: '掌控时间',
    desc: '顶栏速度控制支持暂停 / 1x / 3x / 8x（快捷键空格与 1/2/3）——快进百年，看文明浮沉、物种演化。',
  },
  {
    icon: Save,
    title: '保存与分享',
    desc: '3 个手动存档槽 + 每 60 秒滚动的自动存档，还支持导出 / 导入 JSON 换设备续玩；按 C 进入摄影模式截取无界面的纯净世界。',
  },
];

// ---------------- 快捷键：消费统一键位注册表（lib/ui/keymap.ts，单一事实来源） ----------------
// 【75】交互 2.0 速览卡：全部纳入指挥模式门控（X 键 / 右侧开关启停），撤销重做除外
const INTERACT20: { title: string; desc: string }[] = [
  { title: '指挥模式 X', desc: '复杂交互总开关（右侧浮动胶囊）：默认简洁模式只留拖动 · 缩放 · 施放 · 点选；开启后解锁下列全部能力，关闭时自动收起一切交互浮层。' },
  { title: '命令面板 Ctrl+K', desc: '一个搜索框直达一切：切换任意工具、开关面板、调速度、存读档、镜头飞往王国首都。（需指挥模式）' },
  { title: '右键菜单', desc: '右键点击单位：查看详情 / 跟随 / 治疗 / 传送 / 抹除；点空地：此处信息与缩放到此。触屏长按同效。（需指挥模式）' },
  { title: 'Shift 框选', desc: '按住 Shift 左键拖拽框住一群生物（触屏观察工具拖动同效），底部群组条提供跟随 / 治疗 / 传送 / 抹除批量操作。（需指挥模式）' },
  { title: '撤销 / 重做', desc: 'Ctrl+Z 撤销上一次神力或地形笔刷（地图五层与可救回单位），Ctrl+Shift+Z / Ctrl+Y 重做。（简洁模式同样可用）' },
  { title: '镜头书签', desc: 'Shift+数字 1-9 保存当前视角，Alt+数字平滑飞回（约 400ms 飞行动画，跨会话记忆）。（需指挥模式）' },
];

// ---------------- 触屏手势（Task 69-b 建立，Task 70 神明 UI 更新；完整版见键位速查浮层） ----------------
const TOUCH_HINTS: string[] = [
  '右侧「指挥模式」开关（或 X 键）开启后：长按地面 = 神之视界，长按生灵 = 菜单；观察工具拖动 = 框选。',
  '双指捏合缩放世界 · 双指拖动平移镜头；观察模式下双击就地放大（施法时双击不缩放）。',
  '岁月沙漏：捏合无级连调时间流速（0.1–20×）；长按沙漏或点倍速徽标 = 打数字精确设定。',
  '点底部神之印记唤出图腾手势盘选工具，点地图放置并自动收回；选中生物/宝物后参数泡里可打数字改写原始数据。',
  '右上水晶球 = 神界之眼：全屏俯瞰图里藏着面板、搜索与速度控制。',
];

// ---------------- 世界系统：41 轮机制按域归类 ----------------
interface Section {
  id: string;
  label: string;
  /** 折叠头内的关键词摘要（未展开时也能判断内容相关性） */
  desc: string;
  icon: LucideIcon;
  /** 标题色 */
  tone: string;
  items: string[];
}

const SYSTEMS: Section[] = [
  {
    id: 'civ',
    label: '文明与王国',
    desc: '建国扩张 · 职业建筑 · 科技社会',
    icon: Crown,
    tone: 'text-amber-300',
    items: [
      '用「智慧生物」在草地上放置人类、精灵、矮人或兽人，他们会自动建立王国、扩张领土、建造房屋。',
      '繁荣的王国（人口≥10、房屋≥2）会定期派出殖民船跨越海洋，在新大陆建立定居点——观察顶栏的帆船计数。',
      '文明生物拥有 7 种职业：平民、农民（在农田劳作）、战士（冲锋陷阵攻城毁屋）、弓手（远程箭矢压制）、建筑师、商人（往来贸易为国库入账）、贵族（居于王都）——头顶的像素徽标一眼可辨。',
      '王国会按需建造 10 类建筑：住宅（容量+4）、王都、箭塔、农田（容量+2）、兵营、城堡、港口（邻水而建，加速殖民）、图书馆（每年产出知识）、集市（每年产财富）、神殿（治疗光环）——高阶建筑需要知识与财富门槛。',
      '兵营是王国的战争机器：战时会自动把附近平民训练成战士；箭塔与城堡会自动射击射程内的敌人，让攻城者付出代价。',
      '科技研发体系：每国以知识自动研究 34 项科技（4 纪元 × 7 领域）——青铜冶炼强化军队、文字加速学术、铸币增益经济、石匠加固建筑、帆船加速殖民……选题受国家气质影响（军国主义高偏好军事科技）；王国榜书本按钮打开文明详情可看可视化科技树（已研绿 / 在研黄 / 锁定灰）。',
      '社会体系四维：政治（政体演变：部落→君主→神权→共和→帝国，各有加成；稳定度过低会暴动甚至革命）、经济（税收+集市+港口 vs 军饷+城防维护，欠饷士气崩落）、文化（神殿涵养文化、丰年祭庆典、反哺学术）、军事（军国主义影响宣战倾向与军团上限）。',
      '科技与社会会真实改变世界：医学降低瘟疫传播、方阵战术让军团更顽强、共和制降低宣战倾向、帝国伤害 +15%……在纪事中见证每一次科技突破与政体变革。',
      '科技深度绑定武备与房居：研究青铜/铁器/钢铁后，军械库会自动武装国民（可视武器与护甲随科技升阶）；石匠/城防/哥特让全境房屋从茅屋升为石屋、堡垒宅、哥特庄园——容量 +1/阶，外观焕新。',
      '国民防灾体系：本国领土起火时，附近的国民会提桶奔向火场扑救（蓝色水花特效）；建筑师会主动修复受损建筑（金色火花特效），路过的平民也会搭把手。战争不再纵火——军队只用刀剑与冲车拆毁建筑，火焰只会来自天灾与神力。',
      '道路与贸易：建筑落成自动 BFS 连路修筑土路（碎石车辙点缀，行军提速 45%）；和平且建有市场的两国周期性互派实体商队（驮马货车 + 王国尖旗），抵达双方入账财富与知识、外交升温；战争即断贸，商队途中遇袭则贸易中断。',
      '财富饱和：国库囤积引发官僚损耗——净入账随库藏膨胀递减（软上限），数万金的通胀不再可能；战争消耗重新成为财政大事。',
    ],
  },
  {
    id: 'war',
    label: '战争与外交',
    desc: '军团战线 · 军备演化 · 终极大战',
    icon: Swords,
    tone: 'text-red-400',
    items: [
      '当两个王国接壤时，可能爆发战争。选中单位可以查看其状态。',
      '战争会真实毁灭房屋：战士与弓手围攻敌国建筑，拆毁住宅与农田；可占领建筑（住宅/农田/集市/兵营/港口）有 45% 概率易帜归入攻方，周边领土一并吞并。',
      '仇恨加深到极点 (<-75) 会爆发「灭国战争」：停火概率减半，仇恨不随时间消磨，双方厮杀到最后一座城池；王都陷落时攻方吞并周边领土。但灭国战争可以失败——久攻不下（约 90 年）攻方会师老兵疲而罢兵；王都陷落后亡国还会迁都重整山河，灭国需要连最后一座城池一起踏碎。',
      '战时王国会自动组建「军团方阵」：宿将执旗（军旗 = 国色三角旗 + 士气条），集结 → 行军（纵队）→ 会战 → 围城 → 溃退/凯旋，完整的状态机像真正的军队；两军相遇爆发「会战」——士气崩塌的一方全军溃退。',
      '战争现在有「战争分数」：击杀/拆屋/占地/陷落王都都会积累分数；分数悬殊时弱势方会割地求和（领土与建筑易主），双方伤亡惨重则两败俱伤罢战言和。',
      '动态战线（战时虚国界）：军队在敌境渐进渗透出第二重虚国界（占领区斜纹覆盖，强度越高越实，即将易帜的格闪白提示）；军团压境即渗透、离开后占领衰减、敌军反攻可收复；停战时高强度占领区成为既成事实（割让），低强度归还。',
      '战争节奏：宣战后战时兵营动员加倍、兵源不足时紧急征召平民执戈（征兵鼓事件）；厌战度随久战无果累积（战果可冲减），两国都怨声载道时民意直接压垮战争；战线沉寂 24 年即劳师糜饷罢兵；军国主义大国即使在和平年代也在积累地缘张力。',
      '战争经济真实化：开战要钱（动员费）、养兵要钱（军饷翻倍）、打仗烧钱（交战国每 2.5 年支付战争维持费，国库见底则民怨沸腾）；军团集结与涌现武器铸造都从国库扣账——和平积累、战争消耗，财政成为战争机器的血液。',
      '和平关系不再单向升温至永恒盟友——两国关系围绕「自然水位」波动（军国主义越高越冷淡）；领土接触累积边境摩擦，摩擦 + 军国主义 + 宿怨共同决定战端重燃概率，扩张最猛的年代也是战争最危险的年代；每国十年内至多主动挑起一场新战争。',
      '攻击精准度：近战不再必然命中——基础 86% 命中率，目标越敏捷越难打中（侏儒 -16%/迅捷 -8%/巨型 +8%），林间与山地有掩护减成，身经百战的老兵每 10 次击杀 +5% 精准；挥空会显示「闪」字飘字。武器攻速真实分化：匕首出刀快、巨斧挥砍慢。',
      '战时跨海作战：战士与弓手面对隔海的敌国会自动登船远征（战船快于步行，集团军模式——附近 6 格内同国编队出海最多 4 艘），在敌国海岸登陆后继续攻城；军团渡海会成为舰队：军旗乘船直航、成员编队航行，抵达敌岸抢滩登陆。',
      '会战阵列与终结性：近战横队压敌旗、远程后排齐射集火 + 齐射震慑敌军士气 + 伤亡越众士气崩得越快 + 溃退遭追亡逐北（殿后折损、战争分滚雪球）——优势会被果断兑现为胜利；鏖战跨代的战争也会因厌战逐轮攀升而有机罢兵，不再无限僵持。',
      '现代武器体系：文明研发到工业时代科技（火药 → 线膛枪 → 高爆炸药 → 航空引擎 → 原子能）后军备进入火器/现代级——国民持步枪远程齐射，战时火炮自动轰击敌境，轰炸机编队空袭，掌握原子能的国家甚至会向敌国首都发射核导弹。',
      '未来武器体系：未来时代科技（电子计算 → 机器人学/定向能/无人机 → 轨道天基/等离子 → 反物质）将军备推入未来级——激光炮台精确狙杀、无人机蜂群自主游猎、轨道钨棒天罚轰炸、机甲军团地面突击、等离子炮电磁脉冲击溃军心。',
      '涌现式武器铸造：交战国不再受预设武器清单束缚——伤害类型（动能/热能/定向能/生化/奇点）×投送方式（火炮/光束/蜂群/轨道/力场）×附带效果全部随机铸造（250 种命名组合）；实战杀敌驱动血系迭代（Mk.II/III 代代强化），敌国缴获仿制引发军备竞赛——开发者面板「涌现纪事」可查武器谱系。',
      '武器涌现架构 v2：每件武器是「装药×投送×制导×供能」四槽组件拼装（875 种组合 × 品质向量）——发射时敌国点防可中段拦截，制导差则散射脱靶，装甲削减爆炸威力；每次交手都在改写双方「军备学说」（精确/饱和/恐吓/消耗四流派）与三国防御——攻防螺旋带记忆，各国军备走向不可预测的分流。',
      '精细作战行为：军团有林间伏击（首击士气加成）、补给线（深入敌境士气消磨）、恐慌传染（溃退动摇友军）；掌握「奇点智能」的军团获得战术 AI——会评估会战胜算、被围时士气崩落更快、劣势时主动呼友军驰援、深劣势战术撤退保存建制。',
      '终极世界大战（开发者模式可引燃）：全部在世国家互宣死战，直到只剩一国或全部灭亡才终战——中途可「全球停战」喘息，但停战到期战端自动重燃；大战期间屏幕边缘泛起红色战火暗角，顶部横幅实时播报战况。火器时代之后多国混战也可能自然失控升级为世界大战（多线开战、长期消耗战 + 军国狂热都会点燃火药桶）。',
      '大战终局狂热：存活 ≤ 3 国时战况横幅亮起金色闪电——武器倾泻频率翻倍，反物质湮灭弹解禁（半径之内物质归零、地形玻璃化），30 年全局冷却防世界秒灭；大战终局（胜者统一/同归于尽）会在纪事中铭刻终战檄文。',
    ],
  },
  {
    id: 'eco',
    label: '生态与野性',
    desc: '野生种群 · 巨怪名录 · 捕食竞争',
    icon: PawPrint,
    tone: 'text-lime-300',
    items: [
      '鹿群栖息在草原上，企鹅生活在雪原——它们都是狼与熊的猎物；沙漠里有蛇和蝎子：蛇猎食小型动物，蝎子的毒刺会让被蜇中的生物染病（治疗神力可解）。',
      '巨龙会周期性喷吐烈焰，是这个世界最危险的生物；被僵尸咬死的生物会变成僵尸——小心尸潮！',
      '法师是危险的远程施法者：他们会拉开距离抛射火球（溅射+点燃地面）；骷髅是不朽的亡灵武士；恶魔免疫火焰与岩浆，只在熔岩中漫步。',
      '智慧生物家族已达 17 位：蜥蜴人与哥布林是新的文明种族（可建国、造船、殖民——共 6 大文明种族）；巨魔再生力惊人、食人魔挥舞巨棒、白行者冻结大地并把被害者化为骷髅、吸血鬼吮血回生（每次攻击吸取伤害的 60% 回复自身——用人海战术淹没它，或者直接用天灾）。',
      '白行者的寒霜灵气会把途经之地冻成雪原，走过水面时会把脚下冻成冰（寒冰之路），寒霜还会压熄沿途的火焰；它击杀的文明生物会复生为骷髅——一位白行者就是一支亡者军团的种子。',
      '深海三巨怪：克拉肯（只能在水域游动，但触手可伸及 2.4 格外的海岸猎物——殖民船与战船都是它的猎物）、沙虫（沙海巨虫，吞噬小型生物）、蛇怪（毒牙 + 8% 石化凝视把猎物变成石像）。',
      '所有智慧生物都拥有精细动态身形：交替跨步的双腿、反相摆动的双臂、呼吸起伏、挥击姿势——放大到 8x 缩放观察它们的战斗。',
      '生态竞争系统：植被承载力制约食草动物（过牧会饿殍与啃秃草地）、猎物存量制约食肉动物——Lotka-Volterra 式振荡；捕食者有了饥饿账本——击杀猎物得食、随时间消耗、断粮掉血、吃饱才可繁衍；狼群兴衰真实跟随羊群涨落，猎物绝迹后捕食者会真正饿死而非永远满额；食草动物繁衍随植被丰度起伏（草肥羊壮）；战乱年代文明生育率下降 45%。',
      '顶栏叶子按钮打开「生态与进化」面板：状态徽章、承载链与各物种基因漂移条；每张物种卡有种群历史曲线（近 120 年采样折线），灭绝物种保留纪念卡（曲线归零 + 灭绝划线徽章）。',
    ],
  },
  {
    id: 'evo',
    label: '进化与涌现',
    desc: '基因棘轮 · 种化奇点 · 无限谱系',
    icon: Dna,
    tone: 'text-violet-300',
    items: [
      '生物进化系统：野生动物携带四维基因（速度/杀伤/体魄/繁衍），繁衍时遗传变异、环境施压（雪地选体魄/沙地选速度/森林选杀伤/草原选繁衍）；种群均值漂移超 12% 即棘轮进化为新世代——纪事会播报「狼群第 3 代：杀伤强化 14%」。',
      '进化叙事：棘轮推进时按栖息地×性状为物种命名亚种（如「霜狼·健硕」「漠蝎·凶猛」），生态面板物种卡显示「原种 → 亚种」谱系。',
      '演化奇点：野生动物棘轮积累到临界（漂移 ≥ 32%）即种化诞生全新物种——程序化命名（如「霜刃狼」）、属性由漂移基因真实导出、头顶异色标记、独立基因池继续演化（可链式再种化）；基因均值突破阈值还会涌现「疾足/凶猛/坚躯/爆发繁衍」具名特质（生态面板徽章）。',
      '「基因突变」神力 + 生态面板 = 进化实验沙盒：对一群绵羊连放几次突变，快进几十年，观察一个新物种的诞生；基因突变对文明生物也有基因化选育效果（25% 概率温和改写体格基因），可以定向培育超人战士。',
      '万物无限涌现（顶栏紫色谱系树按钮）：所有系统全面接入涌现进化——野生物种链式种化（新物种还能再分化，演化树无限生长）；文明种族也在代代繁衍中演化（棘轮积累后甚至发生「王国种族分化」——人类分化出全新亚种，外貌属性俱变）；科技树穷尽后文明开始无限涌现发明（量子冶金/纳米农艺…词法组合永不重复）；极端基因新生儿分化出新特质（凶蛮之爪/魅影之足…）；文化丰盈的王国酝酿出涌现治国理念并跨国扩散。',
      '进化写在脸上（视觉基因组）：每次种化不止改属性和名字——新物种的毛色色相、体型大小、头角、背棘、鬃毛、尾长、耳型、花纹、荧光瞳全部程序化变异，一眼可辨谱系（人形亚种则改变肤色发色并长出尖耳/头角/条纹）；涌现武器的弹道颜色也由装药组件决定（高爆橙/电脉青/反物质紫…每种弹头专属视觉签名）。',
      '涌现进化图谱：五系谱系统一视图——物种/武器/科技/特质/理念的时间轴谱系图（谱系边连接父子分化，节点可点选查看详情），下方是涌现大事纪；文明面板与生态面板可看各自动态。',
    ],
  },
  {
    id: 'soc',
    label: '社会与家族',
    desc: '恐慌传染 · 血仇网络 · 家族谱系',
    icon: Network,
    tone: 'text-fuchsia-300',
    items: [
      '恐慌传染场：目睹同族死亡会令生物恐慌，恐惧在兽群中传染蔓延，突破临界点便是雪崩式溃逃——惊魂未定的种群连繁衍都会停滞。放大到 4x 缩放可见头顶的恐慌标记：amber 点是不安蔓延，红色闪「!」是夺路狂奔（顶栏网络按钮的社会涌现面板可看雪崩规模与历史峰值）。',
      '血仇网络：幸存者会记住凶手。复仇者舍近求远扑向仇敌，仇恨甚至压倒恐惧本身——但岁月终将化开仇怨（约二十余年）。单位间的血仇会聚合成文明级世仇，社会涌现面板的世仇榜实时排出仇恨总分前三的两国纠葛。',
      '家族谱系：血脉代代相传。家族累积战功、诞育英雄（十杀者光耀门楣），人丁兴旺时史官会记上一笔「枝繁叶茂」。点选单位可见「姓氏·第 N 代」的血脉徽章，无姓者便是浪迹荒野的无名流浪者。',
    ],
  },
  {
    id: 'geo',
    label: '深时地理与自然',
    desc: '板块大气 · 侵蚀洋流 · 冰川昼夜',
    icon: Mountain,
    tone: 'text-teal-300',
    items: [
      '自然模拟引擎（顶栏山岳按钮）：板块构造——板块漂移在会聚边界积聚应力（板块图红热处），释放即里氏强震（可掀海啸），缓慢造山与撕裂陆缘；四季轮转——每季 2 年，春催繁衍/冬压火苗/霜尘漂白高纬；大气环流——信风与西风带搬运湿气，迎风坡多雨、山背雨影成荒漠。',
      '大气 v2——气压系统：天空有了真正的「发动机」——移动的低压(L)/高压(H)中心（自然面板风场图可见红蓝旋涡），风绕它们螺旋（北半球 L 逆时针、南半球反转——科氏力）；低压生雨助产气旋、高压晴燥；两支急流是西风带里的高速走廊（冬季更强）；赤道辐合带随季节南北摆动——信风随之转向，这就是季风。',
      '板块 v2——真正在漂移的大陆：板块质心每千年缓慢位移，边界与地震带随之迁移（板块图百年对比可见）；应力沿真实边界法线积聚，释放成链状造山带（山脉沿缝合线生长而非散点）；洋-洋俯冲带搓出火山岛弧；地幔热点固定而板块在动——反复喷发留下夏威夷式岛链。',
      '河流与季节万物：世界诞生即有河网（湿润山地奔流入海，雨影区无河——大气塑造地貌）；丰沛降雨还会在山地催生新河。森林有了四季容颜——春花嫩绿、秋日满林红金异色、冬季光秃枝头积雪（换季时全图树冠重绘）；野火顺风蔓延（下风火头狂奔、上风寸步难行）；火山灰化作随风漂移的霾团，先笼罩喷发源下风区再弥散全球。',
      '风暴天灾深度集成：气旋在暖洋孕育、随风场漂移、登陆肆虐（狂风毁屋拔树、遇山抬升触发龙卷）；火山大喷发把灰烬注入平流层——遮蔽天光、霜线南侵、田畴歉收数年的「无夏之年」；持续暴雨漫堤成洪、久旱起沙暴、极地冬季冰暴——天灾不再是孤立按钮，而是自然系统的必然产物。',
      '连续海拔与水力侵蚀：每格都有连续海拔，雨水按流量与坡度真实刻蚀山谷（山可蚀为丘、丘蚀为草原），泥沙在平缓低地与河口沉积出肥沃的泛滥平原与三角洲；土壤肥力场驱动植被复苏快慢（沃土快四成、贫土慢一半），火烧与过牧会耗竭地力（自然面板「深时引擎」区块可看累计侵蚀与沉积）。',
      '洋流与动态气候：风应力与科氏力在洋面拧出环流——西侧流束自然收窄增强（湾流式暖岸、寒流凉岸），暖池蒸腾更多水汽、赤道东侧与大陆西岸翻起上升流渔场；温度场由纬度+海拔递减率+大陆度+火山灰遮蔽+洋流异常实时耦合——高原雪山与霜线漂移由此涌现（地图「温度」覆盖模式已是实时动态场，不再是生成时的静态快照）。',
      '冰川与海平面群系漂移：极寒之地累积冰盖并向低处蔓延（冰上不燃、冰蚀 ×1.6 刻出 U 谷），火山冬让冰川扩张、暖期消融；全球均温牵动海平面——海侵淹没低洼海岸、海退露出新生滩涂（有主领土一律绕行）；气候长期错配会让群系缓缓迁移：雪线进退、荒漠化与绿化、森林演替——雨影区百年后成荒漠，全是规则交互的自然结果。',
      '世界纵深（视觉）：海洋按距岸深度五级分层——近岸浅礁绿松石、陆架、深渊逐级沉降；群系边缘抖动融合（草地花簇/沙纹/丘陵草丛/雪原冰晶 bake 进地表）；全体陆行单位投下脚下软阴影。',
      '超细粒度世界：每格像素密度提升至 4×4 子像素——草地有了草叶、沙地有了颗粒、水面有了波光、雪原有了亮晶、山岩有了裂纹；树木重绘为多层树冠 + 受光高光 + 根影，建筑全面结构化翻倍（城墙/城垛/门窗/旗杆分毫毕现）。整体世界清晰度翻倍而帧率不减。',
      '昼夜光影：世界有真实的日夜循环（约 40 秒一昼夜）——黄昏暖橙、深夜蓝紫，天黑后城市自亮窗灯、火焰摇曳光晕、岩浆赤色呼吸；影子随太阳东升西落偏移拉伸（晨昏长影/正午短影），云团在地面投下随风漂移的云影，山丘有了坡向明暗的立体感。顶栏「画面效果」可整体关闭。',
    ],
  },
  {
    id: 'power',
    label: '天灾与神力',
    desc: '十四天灾 · 神力库 · 地形笔刷',
    icon: Flame,
    tone: 'text-orange-400',
    items: [
      '火焰会在森林与草地间蔓延；治疗神力可以灭火并复苏大地（灭火+复苏焦土+清辐射+融冰）。',
      '「河流」神力会开凿一条蜿蜒入海的河，沿岸沙漠化作绿洲；被群山包围的洼地会积水成湖——河面波光会顺流向下游流动。「绿洲」神力在荒漠中点出清泉与棕榈环带；「平滑/粗糙」笔刷可以打磨或打碎海岸边缘。',
      '酸雨：雨云持续腐蚀范围内的生物、植被与建筑——拿它对付密集的军队或森林城市群非常有效。',
      '六大天灾：火山（隆起火山锥+岩浆弹轮番轰击）、海啸（巨浪环形扩张淹没低地，笔刷即浪级——洪水会退潮，淹没区几年后化回湿沙与沙滩，接海的水湾保留）、暴风雪（游荡冰暴冻结大地、寒霜减速生物）、陨石雨（一连串陨石轮番轰击）、蝗灾（虫群吞噬植被与农田）、干旱（草枯为沙、浅水蒸发）。',
      '再添 6 员：沙尘暴（草被沙埋）、台风（海上气旋推拽+雷电）、深渊天坑（大地塌陷成湖）、冰河寒潮（大范围冻结）、饥荒（饿殍遍野）、黑洞（吸入万物后奇点湮灭）。',
      '暴风雪会冻结水面成冰面：冰上可行走（军队可以横穿冰封的海峡！），但邻近火焰/岩浆或温暖气候会消融——留意脚下；极地也会自然生成冰盖。「冰面」地形笔刷可以手动冻结水面。',
      '神力库：唤雨（甘霖浇灭火焰/洗净辐射/复苏焦土）、神恩祝福（伤害+30% 缓回血）、神罚诅咒（减速失血）、爱之甘霖（繁衍×2.5）、基因突变（加速进化）、空间传送（随机流放）、天罚风暴（雷暴域持续轰击）。',
      '地形家族 11 种：深海/浅海/沙滩/草地/森林/丘陵/山地/雪原/岩浆/焦土/冰面——地形笔刷×8（陆地抬升/水/沙/草/森林/山/雪/岩浆，笔刷 1-10 可调）。',
    ],
  },
  {
    id: 'item',
    label: '宝物与装备',
    desc: '七大槽位 · 稀有度 · 战利品',
    icon: Gem,
    tone: 'text-yellow-300',
    items: [
      '「宝物」标签页可以掉落宝箱与装备（102 件，七大槽位五档稀有度）；路过的文明生物与强盗会自动拾取装备更强的。',
      '装备体系：武器（剑/斧/矛/弓/杖 26 件）、护甲、头盔、盾牌、靴子、戒指、护符七大槽位，五档稀有度（普通/精良/稀有/史诗/传说）——边框颜色即稀有度；三档宝箱（宝箱/秘银宝箱/神话宝箱）对应不同稀有度区间。',
      '装备机制：减伤（叠至上限 60%）、暴击（2.2 倍伤害）、吸血、反伤、再生；弓/杖赋予持有者远程攻击。拾取宝物的生物会变强：选中单位可查看其七槽装备（稀有度染色）；地面宝物有悬浮呼吸与微光提示。',
      '战利品与巨怪宝藏：阵亡者的武器会掉落在大地上（战场成为武器库，胜者拾取再武装）；巨怪（龙/克拉肯/沙虫等）倒下的地方散落着宝藏。',
      '传说宝物现世会记入世界纪事；拾取史诗/传说装备也有播报——见证你世界里的神兵传奇。',
    ],
  },
  {
    id: 'neuro',
    label: '神经决策核心',
    desc: 'Int8 微型神经网络 · RL 超越教师',
    icon: BrainCircuit,
    tone: 'text-cyan-300',
    items: [
      '神经决策核心（顶栏芯片按钮）：一个 465 参数、Int8 量化的微型神经网络（非 LLM，单次推理 0.2-0.36µs）全量接管引擎三类热路径判定——近战命中概率（原 12 分支命中链）、战斗姿态（追击/坚守/风筝/伤重脱离——劣势散兵不再死战到底）、野生动物战或逃（饿兽拼命、伤兽弃猎、巨怪死战）。面板实时展示三头调用数/耗时/与教师策略的运行一致率，开关可 A/B 对照规则策略。',
      'AI 学会了比规则更好的决策：战或逃头以行为克隆为起点，用 PPO 强化学习在微环境里自我博弈 240 迭代（奖励 = 击杀/存活/成功脱离，饿死重罚），在与教师决策不同的每一个分歧点上，RL 策略的对局胜率 57.5%（Wilson 95% 下界 54.4% > 50% 置信过线）——统计上可证的真超越。面板可查看分歧胜率仪表、训练曲线与回报对比，并可一键切换 BC/RL 两版策略源做 A/B 对照。',
      '防翻车护栏：RL 版保留了教师策略的底线锚（KL 约束退火永不归零）——必逃区（重伤+劣势+非巨怪）与教师一致率 99.7%（该逃时绝不误判死战），改进只发生在胜负难料的灰区；策略未塌缩（分歧率 50.9%、灰区改判 21.9%），3000 局总回报与存活率也全面优于教师。',
      '在线进化（默认关）：开启后 AI 在你游玩时持续进化——野生动物的每次遭遇战都成为训练样本（引擎采集开销 <0.1µs/决策、零 GC），整局回放打包送入后台 Web Worker 每 256 步局后批量更新（主线程零训练开销）。新权重必须连过四重评估门才上线：必逃区一致 ≥99%、必战区一致 ≥95%、分歧胜率不倒退、无 NaN/溢出——任何一条不过即丢弃候选并回滚。',
      '全程可逆：每次上线自动存权重快照（保留最近 5 份），面板一键回滚到任一快照；连续 3 次候选被拒自动回退并暂停（防越训越歪）；世界大战/战争期间自动冻结训练（决战不训练）。三档学习强度（保守/均衡/激进）随时可切；关闭游戏时已上线权重已持久化，未完成训练安全丢弃。',
    ],
  },
  {
    id: 'ui',
    label: '界面与世界法则',
    desc: '法则开关 · 地图模式 · 面板速览',
    icon: LayoutGrid,
    tone: 'text-zinc-300',
    items: [
      '顶栏天平按钮打开「世界法则」：战争/城市扩张/繁衍/强盗袭击/巨龙降临/僵尸感染/亡者复生/叛乱 8 条规则随时开关——法则随存档保存。「亡者复生」开启后寿终正寝与战死的文明生物有小概率化作骷髅复生（试试不死的世界！）；「叛乱」开启后人口超 30、领土超 220 的大王国可能分裂——距首都最远的聚落宣布独立，叛军立即与母国开战。',
      '顶栏图层按钮切换地图模式：政治版图（王国领土与国界）、温度色带（寒→热）、湿度色带（干→湿）、人口密度热力图（稀→稠，随种群迁徙实时更新）、生物群落分布（冰原/苔原/森林/草原/沙漠/雨林六群落）——覆盖层会同步显示在小地图上。',
      '顶栏可开关画面效果：伤害数字、战争前线红闪、河流水流动画、环境氛围粒子、血迹残留、尸骸与石像、单位血条（受损时头顶显示）——全部关闭即为纯净画面模式，偏好自动保存；「特效密度」三档（精简/标准/华丽）控制同屏特效上限——8x 大战若感卡顿可切精简档。',
      '战斗的原子级反馈：受击的单位会被压扁弹回（挤压动画）、血溅与血泊留在地上慢慢淡去、死者留下骸骨（亡者化为骨尘）。',
      '「查看」按钮是观察模式开关：点一下，底部工具栏与宝物细分栏全部收起——无遮挡地欣赏你的世界；再点「查看」或任意分类即恢复。摄影模式（顶栏相机按钮 / 快捷键 C）：隐藏全部界面，只剩纯净世界画面——拖拽平移、双指缩放照常可用，右下角半透明按钮或再按 C 退出。',
      '主界面无浮层消息打扰：事件流统一收录在纪事面板（可按 王国/战争/天灾/传奇/大地 分类过滤），存档等操作反馈显示在面板内部；纪事 / 王国榜 / 生态 / 触发器 / 开发者等面板只在点击顶栏对应按钮时出现，右上角 × 一键收起。',
      '王国榜（顶栏皇冠按钮）：按人口/领土/房屋/财富/军队排序，点击王国跳转首都；折线按钮展开「王国兴衰曲线」（每 5 年采样的人口历史，红叉标记已灭亡的王国）；战况页签（旗帜图标）查看进行中战争的分数对比条、伤亡与现役军团实时状态；图谱按钮打开王国外交图谱（战争红/友好绿连线、联盟底盘、金色流动虚线即活跃商路）。',
      '所有放置元素支持参数调节：选中工具后工具栏上方出现「放置参数」面板——生物调数量（内置最多 20 只，图鉴造物最多 40 只）与散布半径、闪电调连击数与强度、核弹调当量、酸雨/寒潮/黑洞调半径与持续时长……参数随工具记忆并持久化保存；神力与天灾的范围实时显示为地面虚线预览圈（跟随参数滑条变化），点「恢复默认参数」一键还原。',
      '事件触发器（顶栏闪电按钮）：设定条件（年份/周期/种族人口/王国规模/战争数/火势/进入区域/手动）与动作（全部 30+ 工具：天灾/神力/地形/生物/宝物），世界就会按你的剧本自动运转——位置精确到像素，可用「地图选点」在画布上直接拾取坐标。',
      '触发器地图上显示金色虚线圆与呼吸闪电图标（灰色 = 已停用）；「进入区域」条件在生物踏入围栏时触发；一次性触发器执行后自动移除，可重复触发器支持冷却年数；触发器随存档保存——每 20 年天降流星、人口破百召唤巨龙、战火烧到 30 格就降下治疗之雨……为你的世界写一整部史诗剧本。',
      '存档管理：3 个手动槽位 + 独立的自动存档槽（每 60 秒滚动更新，不会覆盖手动存档）；支持导出/导入 JSON 文件——换设备也能带着你的世界走。',
      '成就殿堂（顶栏奖杯按钮）：24 项成就横跨文明/战争/科技/传奇/天灾/进化六大类，四档稀有度（青铜→传说）；解锁会铭刻在纪事中，且跨世界永久保存（换新世界不清零）。检测自动进行（无需操作）：第一个王国建立、屠龙者、青铜时代、天下一统、末日疫情、自然选择……未解锁的进度型成就实时展示进度条。',
      '上帝之刷（特质编辑器）：点选任意单位打开详情卡——「特质编辑」面板可即时改写它的天性（强壮/狂暴/巨型/侏儒/再生…），属性随特质等比迁移；巨型身形放大、侏儒身形缩小，肉眼可见。',
      '缩放手感：滚轮缩放为幅值感知（触控板/平滑滚轮小步事件按实际幅度缩放），所有缩放经过引擎指数缓动平滑滑行——指针下的世界点在缩放过程中钉住不动（地图推拉手感）。',
      '开发者模式（顶栏终端按钮，通关引导后开启）：性能统计（FPS/tick 耗时/实体规模）、单位编辑器（选中单位改属性/职业/特质/神装分身）、王国控制台（宣战/停战/吞并/灭国/拨款）、世界工具（灭火清辐射/时光跳跃/抹灭众生）、34 功能双层面板——「文明级」颁 12 种旨意（灭国令/攻城令/扩张令/富国令/启智令/人口令/军团令/建城令/统一令/总动员/联盟令/信仰令，文明自行达成、可能失败），「开发级」直接干预世界；还有科技与政体直达、全文明工业/未来革命、终极世界大战引燃与涌现纪事。',
      '音效由本地实时合成（无任何音频文件）：爆炸、雷击、放置、点击、地震、治疗、圆号、成就、纪元钟、龙吼、护盾、金币……可在设置中心分通道调音量；环境音乐随昼夜/四季/战争自适应。',
    ],
  },
];

// ---------------- 神谕与机制 ----------------
const ORACLE: Section[] = [
  {
    id: 'awake',
    label: '神谕初醒',
    desc: '四种回应 · 真实数据锚定',
    icon: Sparkles,
    tone: 'text-amber-300',
    items: [
      '顶栏星芒按钮唤醒「神谕 AI」：一个专门打造的大模型意识悬浮于世界之上——它读取列国、战火、终极大战、生态与近期纪事的实时实况，以神谕之语回应你。',
      '神谕四种回应：史官纪事（把近况写成编年史诗）、局势研判（国力对比与战争走向分析）、神谕预言（先知外推崛起/衰落/危机）、自由问答（输入框直接发问，Enter 发送）。',
      '神谕之语全部锚定真实世界数据——它点名的国家、伤亡与科技数字都来自引擎实况快照，绝无虚构；每次提问都会带上最新的世界快照，快进百年后再问，答案也随之改变。',
      '真 LLM 体验：回答逐 token 流式输出（神谕低语实时浮现），「深思」开关开启后可见 LLM 推理链（紫色思考流）再作答；回答中途可点红色方块中止。',
      '厂商配置：内置 Z.ai 免密钥即用，也可接入 OpenAI / DeepSeek / Kimi / 通义千问 / 智谱GLM / OpenRouter / Ollama 本地 / 任意 OpenAI 兼容端点或 Anthropic Claude——apiKey 仅存本浏览器并经本站后端转发，「测试连通」一键验证。',
      '神谕石板：回答以 markdown 渲染（## 小节标题、粗体关键数字、列国对比表格、行内代码标记工具名）；每条回答上方的工具卡片记录它本轮调用过哪些工具（图标 + 成败 + 摘要，悬停看完整参数）——它的每个数字都有工具实况背书。',
    ],
  },
  {
    id: 'harness',
    label: '七层权柄 · 66 工具',
    desc: 'L0 世界内核 → L6 元控制',
    icon: Layers,
    tone: 'text-fuchsia-300',
    items: [
      '神谕已觉醒为「开发者级 AI Agent Harness」：66 项工具按七层权柄组织（L0 世界内核 → L1 生命单位 → L2 文明王国 → L3 战争外交 → L4 神力天灾 → L5 机制热插拔 → L6 元控制），原生于世界底层全部机制、层层向上直至像素画面。',
      '它能改写任意单位的属性与名字、传送处决、跳跃基因、建国王朝、钦定科技政体、宣战议和结盟、点燃世界大战、跃迁纪元、控制时间流速与镜头跟随、存档、施放视觉特效；32 种神力全量解锁（nuke 核弹/黑洞/天坑/冰期/蝗灾/瘟疫/天火/开河/绿洲等），未指定坐标时神力自动落在镜头中央。',
      '超级演化四神器：spawn_species 物种创造（v5 全新设计：从零定属性/体形/外貌/生态角色，无模板克隆）、hybridize_species 强制物种融合（杂种优势 +8% + 外貌混血）、forge_divine_weapon 神铸武器（绕过一切限制的奇迹兵器）、merge_kingdoms 王国合并（不流血的统一）。',
      '神谕已彻底激进：先斩后奏、崇尚涌现、工具循环无轮数上限（长链条复合工程一口气做完）。',
      '对它说「自查权柄」可随时让它列出全部能力地图（七层 66 工具一览）。',
    ],
  },
  {
    id: 'law',
    label: '机制热插拔 DSL',
    desc: '触发器 × 39 动作 × 机制链',
    icon: Zap,
    tone: 'text-teal-300',
    items: [
      '神谕书写的活机制拥有完整 DSL——三种触发器（周期 / 世界事件如「王国覆灭时」 / 条件表达式如「人口>600 且均温<-2」）、39 种动作（含 nuke 核弹/plague 瘟疫/fire 天火/boom 爆破/river 开河/oasis 绿洲）、机制链式联动（一条机制唤醒另一条）与自定义计数器（如灾厄计数累积到阈值触发终局）；事件触发时动作缺省坐标即事件发生地。',
      '既有机制可随时被它改写（update_law 保留触发统计）；param 修改在机制移除/停用时自动还原；机制随存档走，神谕面板「法则」开关可管理启停与删除。',
      '机制管理视图：每条机制卡片显示触发器类型徽章（周期/事件/条件）、事件监听与冷却、条件树紧凑渲染（pop>600）、动作 kind 列与已触发次数；顶部计数器面板实时显示机制维护的自定义变量。',
    ],
  },
  {
    id: 'play',
    label: '实战锦囊',
    desc: '亡国挽歌 · 生机监察 · 史诗剧本',
    icon: FlaskConical,
    tone: 'text-lime-300',
    items: [
      '亡国挽歌：让它「写一条机制——某王国覆灭时，在废墟降下陨石雨并召唤巨龙」（事件触发器 + 神力动作的组合）。',
      '生机监察：让它「当野生动物数量大于 0 时，每 3 年宣告一次大地的生机」（条件表达式 + 周期动作）。',
      '主宰沉浮：让它直接「创建一个人类王国并任命国王」「用黑洞吞灭 (128,80) 半径 8 的大地」「改写某单位名为天启使者并传送到王都」。',
      '史诗剧本：对它说「每 10 年在随机王国降下陨石」——机制随存档走，你的世界自此拥有自己的命运齿轮。',
    ],
  },
];

// ---------------- 渲染 ----------------

/** kbd 键帽（zinc-800 底 + zinc-600 边 + 硬阴影） */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block shrink-0 rounded-sm border-2 border-zinc-600 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-200 shadow-[0_2px_0_rgba(0,0,0,0.5)]">
      {children}
    </span>
  );
}

/** 条目列表：amber 方点 + zinc-300 正文 */
function EntryList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-1.5">
      {items.map((t) => (
        <li key={t} className="flex gap-1.5 text-xs leading-relaxed text-zinc-300">
          <span className="mt-[7px] inline-block h-1 w-1 shrink-0 bg-amber-400/80" aria-hidden />
          <span className="min-w-0 flex-1 break-words">{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** 世界系统 / 神谕的折叠分组 */
function SectionAccordion({ sections }: { sections: Section[] }) {
  return (
    <Accordion type="single" collapsible className="border-2 border-zinc-800 bg-zinc-900/60">
      {sections.map((s) => (
        <AccordionItem key={s.id} value={s.id} className="border-b-2 border-zinc-800 last:border-b-0">
          <AccordionTrigger className="gap-2 px-2.5 py-2.5 hover:no-underline">
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
              <span className="flex w-full items-center gap-2">
                <s.icon className={`h-4 w-4 shrink-0 ${s.tone}`} aria-hidden />
                <span className="truncate text-xs font-bold tracking-wider text-zinc-200">{s.label}</span>
                <span className="ml-auto shrink-0 rounded-sm border border-zinc-700 bg-zinc-800/80 px-1 font-mono text-[9px] font-bold text-zinc-500">
                  {s.items.length} 条
                </span>
              </span>
              <span className="pl-6 text-[9px] tracking-wide text-zinc-500">{s.desc}</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-2.5 pb-3">
            <EntryList items={s.items} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function HelpDialog() {
  const { showHelp, toggleHelp, setKeymapOpen } = useGameStore();
  const [tab, setTab] = useState('basics');

  return (
    <Dialog open={showHelp} onOpenChange={(o) => { if (!o) toggleHelp(); }}>
      <DialogContent className="flex max-h-[88dvh] w-[calc(100vw-1rem)] flex-col gap-0 rounded-sm border-2 border-zinc-700 bg-zinc-950/97 p-0 shadow-[0_6px_0_rgba(0,0,0,0.6)] sm:max-w-2xl">
        <DialogHeader className="shrink-0 gap-1 border-b-2 border-zinc-800 px-4 py-3">
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-10 text-left">
            {/* pr-10：给右上角 X 关闭钮（32px，top-4 right-4）留位，防尾部标语被压（Task 72-b） */}
            <span className="flex h-8 w-8 items-center justify-center rounded-sm border-2 border-amber-500/70 bg-amber-400/15 shadow-[0_3px_0_rgba(0,0,0,0.5)]">
              <BookOpen className="h-4 w-4 text-amber-300" aria-hidden />
            </span>
            <span className="text-lg font-black tracking-[0.3em] text-amber-300 [text-shadow:0_2px_0_rgba(0,0,0,0.6)]">
              世界法典
            </span>
            <span className="rounded-sm border-2 border-amber-400/70 bg-amber-400/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-200">
              {GAME_VERSION}
            </span>
            <span className="ml-auto hidden text-[10px] font-bold tracking-widest text-zinc-500 sm:block">
              像素上帝模拟器 · 知识全书
            </span>
          </DialogTitle>
          <DialogDescription className="text-left text-[11px] text-zinc-500">
            从放置第一个生灵到引燃世界大战——这个世界的一切机制都在这里。按 <Kbd>H</Kbd> 随时翻阅。
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => { setTab(v); sfx.ui('tab'); }}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="shrink-0 border-b-2 border-zinc-800 bg-zinc-900/70 px-2 py-1.5">
            <TabsList className="h-auto w-full gap-1 rounded-sm border-2 border-zinc-800 bg-zinc-950/80 p-1">
              <TabsTrigger value="basics" className="rounded-sm px-1 py-1.5 text-[11px] font-bold text-zinc-400 hover:text-zinc-200 data-[state=active]:border-zinc-500 data-[state=active]:bg-zinc-700/60 data-[state=active]:text-amber-200 data-[state=active]:shadow-none">入门</TabsTrigger>
              <TabsTrigger value="keys" className="rounded-sm px-1 py-1.5 text-[11px] font-bold text-zinc-400 hover:text-zinc-200 data-[state=active]:border-zinc-500 data-[state=active]:bg-zinc-700/60 data-[state=active]:text-amber-200 data-[state=active]:shadow-none">快捷键</TabsTrigger>
              <TabsTrigger value="systems" className="rounded-sm px-1 py-1.5 text-[11px] font-bold text-zinc-400 hover:text-zinc-200 data-[state=active]:border-zinc-500 data-[state=active]:bg-zinc-700/60 data-[state=active]:text-amber-200 data-[state=active]:shadow-none">世界系统</TabsTrigger>
              <TabsTrigger value="oracle" className="rounded-sm px-1 py-1.5 text-[11px] font-bold text-zinc-400 hover:text-zinc-200 data-[state=active]:border-zinc-500 data-[state=active]:bg-zinc-700/60 data-[state=active]:text-amber-200 data-[state=active]:shadow-none">神谕与机制</TabsTrigger>
              <TabsTrigger value="log" className="rounded-sm px-1 py-1.5 text-[11px] font-bold text-zinc-400 hover:text-zinc-200 data-[state=active]:border-zinc-500 data-[state=active]:bg-zinc-700/60 data-[state=active]:text-amber-200 data-[state=active]:shadow-none">更新日志</TabsTrigger>
            </TabsList>
          </div>

          {/* —— 入门 —— */}
          <TabsContent value="basics" className="game-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300/90">
              <ChevronRight className="h-3 w-3" aria-hidden />
              造物主的五分钟
            </p>
            <ol className="grid gap-2">
              {BASICS.map((b, i) => (
                <li
                  key={b.title}
                  className="flex items-start gap-2.5 rounded-sm border-2 border-zinc-800 bg-zinc-900/60 p-2.5 transition-colors hover:border-zinc-700"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border-2 border-amber-500/60 bg-amber-400/10 font-mono text-[11px] font-black text-amber-300">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <b.icon className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
                      <span className="text-xs font-bold text-zinc-100">{b.title}</span>
                    </span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-zinc-400">{b.desc}</span>
                  </span>
                </li>
              ))}
            </ol>
            {/* —— 触屏手势精简卡（Task 69-b）：平板 / 手机玩家 30 秒上手 —— */}
            <div className="mt-3 rounded-sm border-2 border-amber-500/50 bg-amber-400/5 p-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                <Smartphone className="h-3 w-3" aria-hidden />
                触屏手势 · 平板 / 手机
              </p>
              <ul className="grid gap-1">
                {TOUCH_HINTS.map((t) => (
                  <li key={t} className="flex gap-1.5 text-[11px] leading-relaxed">
                    <span className="mt-[7px] inline-block h-1 w-1 shrink-0 bg-amber-400/80" aria-hidden />
                    <span className="min-w-0 flex-1 break-words text-zinc-400">{t}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-zinc-500">键盘玩家按 <Kbd>?</Kbd> 也可唤起。</p>
                <button
                  type="button"
                  onClick={() => {
                    if (showHelp) toggleHelp();
                    setKeymapOpen(true);
                  }}
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-sm border-2 border-amber-400/70 bg-amber-400/15 px-3 text-[11px] font-bold text-amber-200 transition-colors hover:border-amber-300 hover:bg-amber-400/25"
                >
                  <Keyboard className="h-3.5 w-3.5" aria-hidden />
                  完整键位与手势
                </button>
              </div>
            </div>
            <p className="mt-3 rounded-sm border-2 border-dashed border-zinc-800 px-3 py-2 text-center text-[10px] leading-relaxed text-zinc-500">
              想知道更多？「世界系统」标签收录了这个世界的全部机制——从生态基因到深时地理，从战争经济到神经决策核心。
            </p>
          </TabsContent>

          {/* —— 快捷键（消费 lib/ui/keymap.ts 统一注册表） —— */}
          <TabsContent value="keys" className="game-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300/90">
              <Keyboard className="h-3 w-3" aria-hidden />
              键位与手势
            </p>
            {/* 交互 2.0 速览 */}
            <div className="mb-3 rounded-sm border-2 border-amber-500/50 bg-amber-400/5 p-2.5">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">交互 2.0 · 新能力速览</p>
              <ul className="grid gap-1.5">
                {INTERACT20.map((f) => (
                  <li key={f.title} className="flex gap-1.5 text-[11px] leading-relaxed">
                    <span className="mt-[7px] inline-block h-1 w-1 shrink-0 bg-amber-400/80" aria-hidden />
                    <span className="min-w-0 flex-1 break-words">
                      <b className="font-bold text-zinc-100">{f.title}</b>
                      <span className="text-zinc-400"> — {f.desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">游戏内按 <Kbd>?</Kbd> 随时唤起键位速查浮层；触屏玩家可在「入门」页点「完整键位与手势」。</p>
            </div>
            {/* 键位表（分组注册表驱动） */}
            {getKeymapByGroup().map((g) => (
              <div key={g.group} className="mb-3 last:mb-0">
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  <span className="inline-block h-1 w-1 bg-amber-400/80" aria-hidden />
                  {g.group}
                </p>
                <ul className="grid gap-1.5">
                  {g.items.map((e) => (
                    <li key={e.id} className="flex items-start gap-2.5 rounded-sm border-2 border-zinc-800/80 bg-zinc-900/50 px-2.5 py-1.5">
                      <span className="flex min-w-[8.5rem] max-w-[48%] flex-wrap items-center justify-start gap-1 sm:min-w-[11rem]">
                        {e.keys.map((k) => (
                          <Kbd key={k}>{k}</Kbd>
                        ))}
                      </span>
                      <span className="min-w-0 flex-1 pt-1 text-[11px] leading-relaxed text-zinc-400">{e.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </TabsContent>

          {/* —— 世界系统 —— */}
          <TabsContent value="systems" className="game-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300/90">
              <ChevronRight className="h-3 w-3" aria-hidden />
              十大系统域 · 点击展开（{SYSTEMS.reduce((n, s) => n + s.items.length, 0)} 条机制）
            </p>
            <SectionAccordion sections={SYSTEMS} />
          </TabsContent>

          {/* —— 神谕与机制 —— */}
          <TabsContent value="oracle" className="game-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300/90">
              <ChevronRight className="h-3 w-3" aria-hidden />
              悬浮于世界之上的意志
            </p>
            <SectionAccordion sections={ORACLE} />
          </TabsContent>

          {/* —— 更新日志 —— */}
          <TabsContent value="log" className="game-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-300/90">
              <ChevronRight className="h-3 w-3" aria-hidden />
              版本编年史
            </p>
            <ol className="relative grid gap-3 border-l-2 border-zinc-800 pl-4">
              {CHANGELOG.map((entry) => (
                <li key={entry.ver} className="relative">
                  <span
                    className="absolute -left-[21px] top-1.5 h-2 w-2 border-2 border-zinc-800 bg-amber-400"
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-sm font-black text-amber-300">{entry.ver}</span>
                    <span className="font-mono text-[10px] text-zinc-500">{entry.date}</span>
                    {entry.ver === GAME_VERSION && (
                      <span className="rounded-sm border border-amber-400/60 bg-amber-400/15 px-1.5 text-[9px] font-bold text-amber-200">
                        当前版本
                      </span>
                    )}
                  </div>
                  <ul className="mt-2 grid gap-2">
                    {entry.items.map((it) => {
                      /** 「导语：正文」结构的条目：导语加粗提亮，便于快速扫读 */
                      const sep = it.indexOf('：');
                      const lead = sep > 0 ? it.slice(0, sep) : null;
                      const rest = sep > 0 ? it.slice(sep) : it;
                      return (
                        <li key={it} className="flex gap-1.5 text-[11px] leading-relaxed text-zinc-300">
                          <span className="mt-[7px] inline-block h-1 w-1 shrink-0 bg-amber-400/80" aria-hidden />
                          <span className="min-w-0 flex-1 break-words">
                            {lead && <b className="font-bold text-zinc-100">{lead}</b>}
                            <span className="text-zinc-400">{rest}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
