@AGENTS.md

## The plan

The current plan is `docs/plans/animation-server.md`: the tool as a local
animation server, with plugins from `cartoons` and RayCraft. Its `## Now`
names the next step; read the rest only when a task needs it.

- **One session, one step.** First restate the step and its "Done when"
  to the user. Its design is worked out in chat, not written into the
  plan. If the work grows past the step (more files, another repo, a
  design question), stop and ask. A new or split step needs the user's
  yes.
- **Status lives in the plan's `## Now`:** update it when a step is done,
  with the date and how it was checked. What was built goes in commit
  messages, not in the plan; memory holds lessons, never status.
- **The other repos:** a step that touches `cartoons`
  (`d:\m\web\cartoons`) reads its `CLAUDE.md` first. A step that changes
  RayCraft runs from a session there, where its guard hook, its notes and
  its `task` skill apply.
