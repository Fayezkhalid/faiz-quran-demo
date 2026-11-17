---
name: call-me
description: Phone the user with a Linphone voice call that plays their recorded message — a success one or a "something went wrong" one. Use when they ask to be called or rung when work is done, e.g. "call me when done", "call me when you finish", "اتصل بي إذا خلصت", "دق علي إذا خلصت", "كلمني لا خلصت", "اتصل علي". Run it as the very last step, after the work is finished and verified.
---

Run as the final step, after everything else is done and verified.

The installed script lives in the user's home, not in this repo:
`<home>/.claude/skills/call-me/call_me.py` (Windows: `C:\Users\<you>\.claude\skills\call-me\call_me.py`).
It is put there by `install.ps1` in this folder (see `README_AR.md`), which also stores the Linphone accounts and password.

Pick the recording by outcome:

- **Success** (task done and verified):
  ```
  python "<home>/.claude/skills/call-me/call_me.py"
  ```
  Plays `voice.mp3`.
- **Something went wrong** (task failed, couldn't be finished, checks/tests still failing, or blocked waiting on the user):
  ```
  python "<home>/.claude/skills/call-me/call_me.py" "<home>/.claude/skills/call-me/wrong.mp3"
  ```

Before calling, check the installed script and `sip-password.txt` exist next to it. If they don't (for example in a cloud or Linux session without Linphone), don't try to install anything: tell the user in the final reply that the call could not be placed from this machine.

Notes:
- The argument can also be text, spoken with TTS (edge-tts, Saudi voice). Use it only if the user asks for a custom spoken message; they prefer their recordings.
- Exit 0 = they answered and heard it. Non-zero = not answered or failed; say so in the final reply.
- Add `-v` to print Linphone logs when debugging.
- SRTP encryption on purpose (ZRTP pops up a code-verification dialog on the phone; don't switch back).
- Never commit `sip-password.txt`, `state/` or the recordings; `.gitignore` here blocks them.
