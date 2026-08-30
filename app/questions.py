from __future__ import annotations

from dataclasses import dataclass

from app.models import OceanDimension, OceanProfile, ProfileSource, QuestionAnswer


@dataclass(frozen=True)
class Question:
    id: str
    dimension: OceanDimension
    prompt: str
    option_a: str
    option_b: str
    option_a_image: str
    option_b_image: str


QUESTIONS: tuple[Question, ...] = (
    Question("E1", OceanDimension.extraversion, "周末午后，你更向往哪种漫步氛围？", "安静的小巷，只有风声鸟鸣", "热闹的街区，有人声有表演", "/assets/questions/district-quiet.webp", "/assets/questions/district-busy.webp"),
    Question("E2", OceanDimension.extraversion, "路过一家咖啡馆，你会选择？", "藏在院子深处的安静角落", "临街外摆，看人来人往", "/assets/questions/cafe-courtyard.webp", "/assets/questions/cafe-street.webp"),
    Question("E3", OceanDimension.extraversion, "漫步时，你更喜欢把注意力放在？", "安静的街巷细节，慢慢观察", "热闹的人群与活动，感受活力", "/assets/questions/district-quiet.webp", "/assets/questions/district-busy.webp"),
    Question("O1", OceanDimension.openness, "你更偏好哪种街巷视觉表达？", "干净留白的墙面，克制有序", "有涂鸦和色彩的墙面，自由有趣", "/assets/questions/wall-clean.webp", "/assets/questions/wall-graffiti.webp"),
    Question("O2", OceanDimension.openness, "走进一条巷子，你希望？", "一眼能看到尽头", "有转角有惊喜，看不到终点", "/assets/questions/lane-straight.webp", "/assets/questions/lane-winding.webp"),
    Question("O3", OceanDimension.openness, "你如何看待墙上的涂鸦？", "觉得乱，破坏建筑美感", "觉得有趣，是城市的表情", "/assets/questions/wall-clean.webp", "/assets/questions/wall-graffiti.webp"),
    Question("A1", OceanDimension.agreeableness, "选择漫步路线，你最在意？", "能不能最快到想去的地方", "路过的风景有没有意思", "/assets/questions/route-direct.webp", "/assets/questions/route-scenic.webp"),
    Question("A2", OceanDimension.agreeableness, "遇到一条岔路，你会？", "打开地图确认方向", "不用导航，凭好奇随意选择", "/assets/questions/plan-map.webp", "/assets/questions/plan-free.webp"),
    Question("A3", OceanDimension.agreeableness, "你更喜欢哪类商业街？", "品牌连锁，品质有保证", "独立小店，每家都不一样", "/assets/questions/store-chain.webp", "/assets/questions/store-indie.webp"),
    Question("C1", OceanDimension.conscientiousness, "出发前，你会做路线规划吗？", "不会，走到哪算哪", "会，大概知道怎么走", "/assets/questions/plan-free.webp", "/assets/questions/plan-map.webp"),
    Question("C2", OceanDimension.conscientiousness, "漫游中想暂停休息，你会？", "临街外摆坐一会儿，顺着眼前节奏继续走", "进到院子深处坐下，安静整理接下来的路线", "/assets/questions/cafe-street.webp", "/assets/questions/cafe-courtyard.webp"),
    Question("C3", OceanDimension.conscientiousness, "你对“打卡”的态度是？", "无所谓，遇到什么算什么", "喜欢按攻略打卡经典点位", "/assets/questions/checkin-casual.webp", "/assets/questions/checkin-planned.webp"),
    Question("N1", OceanDimension.neuroticism, "走进一条较暗的窄巷，你会？", "没什么感觉，继续走", "有点紧张，想快点出去", "/assets/questions/dark-alley-explore.webp", "/assets/questions/dark-alley-leave.webp"),
    Question("N2", OceanDimension.neuroticism, "周围人很多、很拥挤时，你？", "可以适应，还好", "容易烦躁，想离开", "/assets/questions/crowd-enjoy.webp", "/assets/questions/crowd-uncomfortable.webp"),
    Question("N3", OceanDimension.neuroticism, "傍晚走进一条光线渐暗的巷子，你会？", "继续停下来观察光影和细节", "更想尽快回到明亮热闹的街道", "/assets/questions/dark-alley-explore.webp", "/assets/questions/dark-alley-leave.webp"),
)

QUESTION_MAP = {question.id: question for question in QUESTIONS}


class AnswerValidationError(ValueError):
    pass


def score_answers(answers: list[QuestionAnswer]) -> OceanProfile:
    if len(answers) != len(QUESTIONS):
        raise AnswerValidationError(f"需要回答全部 {len(QUESTIONS)} 道题")

    ids = [answer.question_id for answer in answers]
    if len(set(ids)) != len(ids):
        raise AnswerValidationError("题目答案存在重复")

    unknown = sorted(set(ids) - set(QUESTION_MAP))
    missing = sorted(set(QUESTION_MAP) - set(ids))
    if unknown:
        raise AnswerValidationError(f"未知题目：{', '.join(unknown)}")
    if missing:
        raise AnswerValidationError(f"缺少题目：{', '.join(missing)}")

    totals = {dimension: 0 for dimension in OceanDimension}
    counts = {dimension: 0 for dimension in OceanDimension}
    for answer in answers:
        dimension = QUESTION_MAP[answer.question_id].dimension
        totals[dimension] += 1 if answer.choice == "B" else 0
        counts[dimension] += 1

    values = {
        dimension: round(totals[dimension] / counts[dimension] * 100, 2)
        for dimension in OceanDimension
    }
    return OceanProfile(
        openness=values[OceanDimension.openness],
        conscientiousness=values[OceanDimension.conscientiousness],
        extraversion=values[OceanDimension.extraversion],
        agreeableness=values[OceanDimension.agreeableness],
        neuroticism=values[OceanDimension.neuroticism],
        source=ProfileSource.test,
        confidence=0.9,
    )
