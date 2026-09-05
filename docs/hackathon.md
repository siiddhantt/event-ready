# Rote Playoffs: submission strategy

Research checked September 5, 2026.

The event runs September 1–6. Luma lists submission close as Sunday 8 p.m.
London: **September 6, 19:00 UTC / September 7, 00:30 India**. Its listed prizes
are MacBook Pro, iPad and iPhone 17 for first through third, with Apple Watches
for social posts tagging Modiqo. The current field guide makes Community
publication the submission; each eligible public Play is a separate entry.
[Event listing](https://luma.com/rotehack),
[current field guide](https://www.modiqo.ai/blog/the-playoffs).

I did not find named technical tracks on these current pages. Treat this as a
competition for the overall Play awards, plus optional reach/social recognition.
The linked GitHub announcement has older prize details and TBD dates, so it
should not override the dated event listing. Its judging criteria are still
useful: repeated usefulness, a fresh live run, reusable parameters and actual
adoption. Judges' exhibition Plays do not compete.
[Announcement](https://github.com/modiqo/play/blob/main/docs/playoffs/ANNOUNCEMENT.md).

## Publication decision

Use public Community publication under `siiddhantt`. The current field guide says
that the claimed handle is the public author namespace and each public Play
published September 1–6 is a separate submission. The versioned URI must open
and run through Rote; there is no separate submission form. The older linked
announcement instead mentions an invited `hackathon` organization. This account
has no organization memberships, so we follow the current Community instructions
rather than claiming membership in the older shared space.

Rote 0.80.0's release message warns that process Plays under a personal handle
can run only for the author. A direct check contradicted that general warning:
`pugarhuda/monorepo-workspace-map@0.1.1`, a public user Play marked with
`privileged_access=process`, ran through its exact registry URI as `siiddhantt`.
Its source was inspected first; the selected local-path run was read-only.
This establishes that public cross-author process execution is available on this
host. Our release acceptance additionally runs each exact published URI; it does
not pretend that another person's Google consent has been tested for them.

Both Plays were publicly published as v0.2.0 on September 5. Each successful
registry receipt explicitly confirms that anyone can resolve and run the public
URI; both exact URIs passed live smoke runs. The generic author-only release hint
therefore does not describe these public publications.

## Published alternatives

This comparison mainly inspects public descriptions/contracts. We additionally
inspected the source of Monorepo Workspace Map and ran its exact public 0.1.1 URI
on this repository to test cross-author execution; it correctly reported that
this repository is not a monorepo. The other Plays were not executed or benchmarked. Registry download
counts can differ between cached feed and version pages, and are not a ranking
of hackathon entrants.

| Public Play | Declared job | Event Ready's useful distinction |
| --- | --- | --- |
| [Daily Inbox Triage](https://play.modiqo.ai/shrinet82/daily-inbox-triage@0.2.0) | Categorizes Gmail from headers and produces a report | Reads message evidence, tracks a resumable cursor, and performs validated Calendar updates |
| [Meeting Prep](https://play.modiqo.ai/jaylabs/meeting-prep@0.1.17) | Uses Gmail bodies and Calendar to write evidence-linked meeting commitment pages; can connect development trackers | A strong adjacent entry: Event Ready's distinction is recurring Calendar changes and repository preparation, not merely reading email bodies |
| [Email Priority Brief](https://play.modiqo.ai/paveenkumar-dev/email-priority-brief@0.0.2) | Extracts stated deadlines and suggests actions in an email briefing | Performs the validated Calendar maintenance and later opens the workspace |
| [Deadline Reconcile](https://play.modiqo.ai/shreyas/deadline-reconcile@0.1.0) | Reconciles local task, GitHub and Calendar JSON deadlines | Acquires new email evidence and maintains actual private events on a running host |
| [Monorepo Workspace Map](https://play.modiqo.ai/pugarhuda/monorepo-workspace-map@0.1.1) | Clones or inspects repositories to map package boundaries without executing their code | A different trust tradeoff: Event Ready explicitly authorizes dependency installation and editor launching for an event |
| Retrieve Recent Emails / Check Calendar Meetings in the [public registry](https://www.modiqo.ai/feed) | Retrieve provider data | Close the loop from email through reminders to the right working repository |

## Best case for winning

Lead with an ordinary problem: “The interview time changed in my inbox; my
Calendar and workspace should catch up.” Prove the complete loop, then show the
same run again without a second event. Show three deadlines from one email,
not three copies of one event. Show the missing-date email being held for review.

The Pi makes the recurring value concrete. The field guide calls a recurring
Play catching a real change a bonus opportunity. Its other bonus is a live
journey showing a correction. Keep the actual authorization failure and cursor
recovery in the demo story: it demonstrates why the final workflow is trustworthy.
Do not disguise it as an uninterrupted perfect first run.

Our main adoption obstacle is account setup. The strongest improvement is clear,
tested OAuth setup, an honest write contract, a no-mail synthetic demo and a
copyable first-run command. The workspace Play provides a smaller entry point
for people unwilling to give an inbox agent Calendar write access immediately.
The competing Meeting Prep already has a sample mode and evidence-linked output;
do not pitch those as unique. Our concrete proof is the live reschedule, retained
failed batch, duplicate check, unattended Pi service, and fresh repository setup.
The unverified Modiqo Calendar consent remains real setup friction. The public
instructions should disclose it before a stranger starts signing in.

Publish after the acceptance checks pass, with useful titles, explicit effects,
portable defaults and a two-minute walkthrough. Ask real users to try it and
report friction. Treat our own repeated verification runs as tests, not adoption.
No automated engagement, resharing or fabricated testimonials. Draft social copy
is in the demo notes; posting it is a separate user action.
