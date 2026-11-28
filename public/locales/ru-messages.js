// {p} is a verbatim player name, seed, or room code. {n} is a numeric value.
// {t} is another public interface or catalog label. $1, $2… refer to captures.
export const ruMessages = `
{p} used {t} on {p}.|$1 применяет «$2». Цель — $3.
{p} used {t}.|$1 применяет «$2».
{t} dealt {n} to {p} ({n} to shield).|$1 наносит $2 урона. Цель — $3. Щит поглощает $4.
{t} dealt {n} to {p}.|$1 наносит $2 урона. Цель — $3.
{p} recovered {n} health from {t}.|$1 восстанавливает $2 здоровья. Источник — $3.
{p} gained {n} {t} from {t}.|$1 получает $2 ($3). Источник — $4.
{t} applied {n} {t} to {p}.|$1 накладывает эффект «$3» ×$2. Цель — $4.
{p} acquired {t}.|$1 получает награду «$2».
{p} etched {t} onto {t}.|$1 наносит «$2» на «$3».
{p} triggered {t}.|$1 активирует «$2».
{p} revealed {t} and survived at {n} health.|$1 раскрывает «$2» и остаётся в бою с $3 ОЗ.
{p} revealed {t}.|$1 раскрывает «$2».
{p} fell to {t}.|$1 выбывает. Причина — $2.
{p} is frozen.|$1 получает заморозку.
{p} thawed.|$1 освобождается от заморозки.
{p} discharged {n} Shock.|$1 теряет заряды шока: $2.
{p} cleansed {n} {t} from {p}.|$1 снимает эффект «$3» ×$2. Цель — $4.
{p} consumed {n} {t} from {p}.|$1 поглощает эффект «$3» ×$2. Цель — $4.
{t} advanced {p}’s {t} cooldown from {n} to {n}.|$1 ускоряет перезарядку «$3» у $2: $4 → $5.
{p} gained an extra full turn from {t}.|$1 получает дополнительный полный ход. Источник — $2.
{p} gained an extra action from {t}.|$1 получает дополнительное действие. Источник — $2.
{p} begins a turn.|Начинается ход бойца $1.
{p} lost one stack of Curse.|$1 теряет заряд проклятия.
{p}’s action was interrupted.|Действие бойца $1 прервано.
{p} opened an additional reward draft.|$1 открывает дополнительный выбор награды.
{p} rerolled the draft{t}.|$1 меняет награды$2.
{p} rerolled the draft.|$1 меняет награды.
{p} is the last contender standing.|На арене остаётся один боец — $1.
The arena burns. All living contenders take {n} unavoidable damage.|Арена горит. Все выжившие получают $1 неизбежного урона.
Sandbox applied {t} to {p}.|Песочница: $2 — $1.
Sandbox applied {t}.|Песочница: $1.
Loaded {t} with seed {p}.|Сборка «$1» загружена. Зерно: $2.
{p}’s extra action|Дополнительное действие: $1
{p}’s extra turn|Дополнительный ход: $1
{p}’s turn|Ход: $1
Start of {p}’s turn|Начало хода: $1
Inspect {p}'s build|Осмотреть снаряжение: $1
Inspect acting contender {p}|Осмотреть активного бойца: $1
Inspect champion {p}|Осмотреть победителя: $1
Target {p}|Выбрать цель: $1
Source {p}|Источник: $1
Defeated by {p}|Победитель дуэли: $1
{p} won|Победитель: $1
{p} wins|Победитель: $1
{p} is up|Ходит $1
{p} chooses bonus loot|$1 выбирает добычу
{p} chooses a reward|$1 выбирает награду
{p} chooses an action|$1 выбирает действие
Preparing {t} against {p}|Готовится «$1». Цель — $2
Preparing {t}|Подготовка: $1
{p}’s {t}|$1: $2
Solo seed · {p}|Зерно матча · $1
Invite friends with room code {p}.|Код комнаты для друзей: $1.
Choose which item to replace with {t}.|Выберите предмет, вместо которого взять «$1».
Reroll ({n})|Сменить ($1)
Take {t}|Взять: $1
Took {t}|Получено: $1
Use {t}|Применить: $1
Choose replacement for {t}|Выбрать замену для «$1»
How {t} works|Как действует «$1»
How {t} work|Как действуют эффекты: $1
Already carrying {n} copy of {t}.|У вас уже есть «$2» ×$1.
Already carrying {n} copies of {t}.|У вас уже есть «$2» ×$1.
Inspect {t}|Осмотреть: $1
View {t}|Посмотреть: $1
{t} build|Сборка: $1
{t} mastery|Мастерство: $1
{t} owned|В коллекции: $1
{t} outfits|Облики: $1
{t} progress|Прогресс: $1
Earn in {n} completed {t} matches, or unlock with coins.|Завершите матчи за класс «$2» ($1) или купите облик за монеты.
{n} rewards are available from the start. Unlock more for your future drafts.|С самого начала доступно наград: $1. Откройте остальные, чтобы они появлялись в будущих матчах.
{n} more coins needed|Не хватает монет: $1
{n} / {n} complete|Выполнено: $1 / $2
{n} / {n} unlocked|Открыто: $1 / $2
{n} / {n} owned|В коллекции: $1 / $2
{t} set to {n}.|$1: задано значение $2.
{t} applied.|Применено: $1.
{t} could not load.|Не удалось загрузить «$1».
Focus {t} constellation|Показать созвездие «$1»
Round {n} begins|Начинается раунд $1
Round {n}|Раунд $1
Turn {n}|Ход $1
Seat {n}|Место $1
R{n}|Р$1
Objectives {n}/{n}|Цели $1/$2
Actions {n}–{n} of {n}|Действия $1–$2 из $3
Your turn in {n} turns|До вашего хода: $1
{n} contenders remain|Бойцов осталось: $1
{n} contenders fell|Бойцов выбыло: $1
{n} contenders|Бойцов: $1
{n} seats|Мест: $1
{n} turns|Ходов: $1
{n} actions left|Осталось действий: $1
{n} left|Осталось: $1
{n} health lost|Потеря здоровья: $1
{n} absorbed by shield|Щит поглотил: $1
{n} absorbed|Поглощено: $1
{n} health damage|Урон по здоровью: $1
{n} damage|Урон: $1
{n} overkill|Избыточный урон: $1
Revived at {n} HP|Возрождение с $1 ОЗ
{n} / {n} HP|$1 / $2 ОЗ
/ {n} HP|/ $1 ОЗ
{n} recorded revivals|Возрождений: $1
{n} intervening effects omitted|Промежуточных эффектов пропущено: $1
This action is pinned. Newer history resumes at action {n}.|Действие закреплено. Новая история начинается с действия $1.
Action detail starts in round {n} (latest {n} events).|Подробности доступны с раунда $1. Сохранено последних событий: $2.
Cooldown {n}|Перезарядка: $1
Ready in {n} personal turn.|Будет готово через $1 свой ход.
Ready in {n} personal turns.|До готовности осталось своих ходов: $1.
Applies to {t}|Будет наложено на «$1»
Replaces {t} in slot {n}|Заменяет «$1» в ячейке $2
{t} full ({n}/{n})|$1: занято $2/$3
cooldown {n} personal turns|Перезарядка в своих ходах: $1
cooldown {n} personal turn|Перезарядка в своих ходах: $1
{n} base damage at 0 stacks|Базовый урон без зарядов: $1
{n} base damage|Базовый урон: $1
{t} {n} → {n} (+{n})|$1: $2 → $3 (+$4)
{t} {n} → {n} base damage at 0 stacks|$1: $2 → $3 базового урона без зарядов
{t} {n} → {n} base damage|$1: $2 → $3 базового урона
{t} {n} → {n} healing before the health cap|$1: $2 → $3 лечения до ограничения здоровьем
{t} {n} → {n} shield|$1: $2 → $3 щита
{t} {n} → {n} personal turns|$1: $2 → $3 своих ходов
{t} {n} → {n} personal turn|$1: $2 → $3 своих ходов
{t} {n} → {n} of {n}|$1: $2 → $3 из $4
{t} {n} → {n}|$1: $2 → $3
Next global turn: {n} base damage as an echo|В начале следующего хода на арене эхо нанесёт $1 базового урона
Next global turn: {n} base damage at 0 stacks as an echo|В начале следующего хода эхо нанесёт $1 базового урона без зарядов
At {n} armor: {n}% rarity promotion per draw|При броне $1 шанс повысить редкость каждой награды составляет $2%
Defend adds {n} permanent {t}|Защита навсегда даёт $1 ($2)
Defend heals up to {n} at your current armor|С нынешней бронёй защита восстанавливает до $1 здоровья
Defend advances your {t} cooldown|Защита ускоряет перезарядку «$1»
{t} will apply {n} {t}|$1 наложит эффект «$3» ×$2
You currently carry {n} Poison|На вас зарядов яда: $1
{t} applies Poison to you|$1 накладывает на вас яд
{t} applies {t} to rivals|$1 накладывает на соперников эффект «$2»
Draws {n} random stat shards|Случайных осколков характеристик: $1
Bastion Bash deals {n} damage before defenses.|Удар щитом наносит $1 урона до учёта защиты.
Bloodrush adds {n} attack|Кровавая ярость даёт $1 атаки
next increase at {n} health.|Следующая прибавка при $1 здоровья.
Next bonus action on personal turn {n}.|Дополнительное действие в ваш $1-й ход.
Next bonus reroll on personal turn {n}.|Бесплатная смена наград в ваш $1-й ход.
Curse healing returns on personal turn {n}.|Лечение от проклятия вернётся в ваш $1-й ход.
Last Rites is ready to heal up to {n} health.|Последний обряд готов восстановить до $1 здоровья.
False Guard returns on personal turn {n}.|Ложная стойка восстановится в ваш $1-й ход.
{n} carried consumable can trigger Distillation.|Расходников для дистилляции: $1.
{n} carried consumables can trigger Distillation.|Расходников для дистилляции: $1.
{n} fittings equipped.|Установлено деталей: $1.
{n} fitting equipped.|Установлено деталей: $1.
Rivet Drive uses {n}/{n} fittings|Поршневой удар использует деталей: $1/$2
+{n} damage before runes.|+$1 урона до учёта рун.
{n}/{n} fittings|Деталей: $1/$2
{t} if the rival survives|$1, если соперник выживет
gain {n} shield|Вы получите $1 щита
heal {n}|Лечение: $1
Gain {n} shield ({n} total)|Вы получите $1 щита (всего $2)
Recover {n} health (already at full health)|Восстановление: $1 (здоровье уже полное)
Recover {n} health|Восстановление здоровья: $1
Recover {n} or {n} health|Восстановление здоровья: $1 или $2
Gain {n} regeneration|Вы получите $1 регенерации
Cleanse {t}|Снятие: $1
{t} (high card)|$1 (старшая карта)
{t} (low card)|$1 (младшая карта)
{t} echo|Эхо: $1
{t} ×{n}|$1 ×$2
`.trim().split('\n').map(row => row.split('|'));

