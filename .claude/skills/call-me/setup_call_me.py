"""One-time setup for the call-me skill (run by install.ps1, or by hand: python setup_call_me.py).

- Copies the call-me folder into %USERPROFILE%\\.claude\\skills\\call-me
- Writes your two Linphone usernames into call_me.py
- Saves the PC account password into sip-password.txt
- Fixes the paths in SKILL.md
- Creates voice.mp3 / wrong.mp3 with a Saudi TTS voice if you have no recordings yet
"""
import asyncio
import getpass
import pathlib
import re
import shutil
import subprocess
import sys

KIT = pathlib.Path(__file__).resolve().parent  # this folder holds SKILL.md and call_me.py
HOME = pathlib.Path.home()
DEST = HOME / ".claude" / "skills" / "call-me"

VOICE = "ar-SA-HamedNeural"
MESSAGES = {
    "voice.mp3": "هلا أبو خالد، معك كلود. خلصت الشغل وكل شيء تمام، تعال شوف.",
    "wrong.mp3": "هلا أبو خالد، معك كلود. صار فيه مشكلة وأحتاجك، تعال شوف.",
}


def ask(prompt):
    v = ""
    while not v:
        v = input(prompt).strip()
    return v


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    for name in ("SKILL.md", "call_me.py"):
        shutil.copy2(KIT / name, DEST / name)
    for name in ("voice.mp3", "wrong.mp3"):  # your own recordings, if you put them in the kit
        if (KIT / name).is_file():
            shutil.copy2(KIT / name, DEST / name)

    print("\nLinphone accounts (created on subscribe.linphone.org)")
    pc = ask("  PC / caller username (e.g. abokhalid-claude): ").split("@")[0].removeprefix("sip:")
    phone = ask("  Phone / callee username (e.g. abokhalid-phone): ").split("@")[0].removeprefix("sip:")
    pw = ""
    while not pw:
        pw = getpass.getpass(f"  Password of the PC account '{pc}' (hidden): ").strip()

    py = DEST / "call_me.py"
    src = py.read_text(encoding="utf-8")
    src = re.sub(r'^USER = ".*?"', f'USER = "{pc}"', src, count=1, flags=re.M)
    src = re.sub(r'^TO = ".*?"', f'TO = "sip:{phone}@sip.linphone.org"', src, count=1, flags=re.M)
    py.write_text(src, encoding="utf-8")
    (DEST / "sip-password.txt").write_text(pw + "\n", encoding="utf-8")

    skill = DEST / "SKILL.md"
    skill.write_text(skill.read_text(encoding="utf-8").replace(r"C:\Users\YOURNAME", str(HOME)),
                     encoding="utf-8")

    missing = [n for n in MESSAGES if not (DEST / n).is_file()]
    if missing:
        print(f"\nNo recordings yet, creating {', '.join(missing)} with a Saudi voice ({VOICE})...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "edge-tts"], check=True)
        import edge_tts
        for n in missing:
            asyncio.run(edge_tts.Communicate(MESSAGES[n], VOICE).save(str(DEST / n)))
        print("  Done. Replace them any time with your own recordings (same file names).")

    print(f"\nReady: {DEST}")
    print("Test it now:  python call_me.py   (from that folder)")


if __name__ == "__main__":
    main()
