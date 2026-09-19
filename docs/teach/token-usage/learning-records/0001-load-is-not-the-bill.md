# The learner conflated first-turn load with what a session is charged

During the 2026-09-19 session the learner asked "29k? I thought it's 13k" and then "so which one am I paying for?" after being shown the per-turn cache split. Prior model: the start-of-session number is the charge. Corrected in conversation to: every turn re-sends the whole context, so the bill is turns × context and the load is paid once per turn. Lesson 0001 targets this directly; treat it as unconfirmed until the quiz is passed.

**Evidence**: the two questions above; accepted the turns × context explanation without further questions.
**Implications**: teach cache mechanics (write vs read, prefix order) only after this floor is confirmed; the learner already operates the autopilot, so lessons can assume comfort with the run log and jsonl files.
