"""Phone yourself on Linphone and play a recorded message (Claude Code "call me" skill).

usage: python call_me.py [audio file | "text to speak"] [-v]
No argument: plays voice.mp3 next to this file, or TTS of DEFAULT_MSG if it's missing.
Exit 0 = answered and message played; 1 = not answered / failed.
Needs sip-password.txt (password of the PC/caller account) next to this file.
"""
import asyncio
import ctypes as C
import math
import os
import pathlib
import subprocess
import sys
import time
import wave

# ---- EDIT THESE TWO LINES ---------------------------------------------------
USER = "your-pc-account"                       # caller (PC) account, without @sip.linphone.org
TO = "sip:your-phone-account@sip.linphone.org"  # callee (phone) account
# -----------------------------------------------------------------------------

HERE = pathlib.Path(__file__).resolve().parent
LIN = pathlib.Path(r"C:\Program Files\Linphone")
DOMAIN = "sip.linphone.org"
VOICE = "ar-SA-HamedNeural"  # TTS voice (Saudi Arabic), only used for text messages (edge-tts --list-voices)
VOICE_FILE = HERE / "voice.mp3"  # your own recording; played when no message is given
DEFAULT_MSG = "هلا أبو خالد، معك كلود. خلصت الشغل وكل شيء تمام، تعال شوف."
RING_TIMEOUT = 60  # seconds before giving up if nobody answers
# SRTP, not ZRTP: ZRTP makes the phone pop up a "compare the code" dialog.
# The wav starts when the call connects, but audio may only get through once ICE has
# found a path (can take seconds). So the message is repeated and we hang up
# after the first repetition that started after the path was up.
LEAD, REPS = 1.5, 4

# LinphoneCallState values (include/linphone/enums/call-enums.h)
STREAMS_RUNNING, ERROR, END, RELEASED = 8, 13, 14, 19
GLOBAL_ON = 2  # LinphoneGlobalState (include/linphone/types.h)
ICE_IN_PROGRESS = 2  # LinphoneIceState (include/linphone/types.h)

RC = f"""[sip]
root_ca={(LIN / "share/linphone/rootca.pem").as_posix()}
default_proxy=0
sip_port=-1
sip_tcp_port=-1
sip_tls_port=-1
media_encryption=srtp

[video]
capture=0
display=0
automatically_initiate=0
automatically_accept=0

[proxy_0]
reg_proxy=<sip:{DOMAIN};transport=tls>
reg_route=<sip:{DOMAIN};transport=tls>
reg_identity="Claude" <sip:{USER}@{DOMAIN}>
reg_sendregister=0
publish=0
"""


def make_wav(msg, wav):
    """msg = audio file path, or text to speak with TTS.
    Lead-in + message (with 1s gap) repeated REPS times. Returns (total, period) seconds."""
    src = msg
    if not os.path.isfile(msg):  # text -> TTS
        import edge_tts  # pip install edge-tts (only needed for text messages)
        src = str(wav.with_suffix(".mp3"))
        asyncio.run(edge_tts.Communicate(msg, VOICE).save(src))
    labels = "".join(f"[r{i}]" for i in range(REPS))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-filter_complex",
                    f"[0]apad=pad_dur=1,asplit={REPS}{labels};{labels}concat=n={REPS}:v=0:a=1,"
                    f"adelay={int(LEAD * 1000)}:all=1",
                    "-ar", "16000", "-ac", "1", "-sample_fmt", "s16", str(wav)], check=True)
    with wave.open(str(wav)) as w:
        total = w.getnframes() / w.getframerate()
    return total, (total - LEAD) / REPS


def load_liblinphone():
    # PATH (not add_dll_directory): plugins like the sqlite backend use plain LoadLibrary
    os.environ["PATH"] = str(LIN / "bin") + os.pathsep + os.environ["PATH"]
    L = C.CDLL(str(LIN / "bin" / "liblinphone.dll"))
    P, S, I, B = C.c_void_p, C.c_char_p, C.c_int, C.c_ubyte
    for name, res, args in [
        ("linphone_logging_service_get", P, []),
        ("linphone_logging_service_set_log_level", None, [P, I]),
        ("linphone_factory_get", P, []),
        ("linphone_factory_set_top_resources_dir", None, [P, S]),
        ("linphone_factory_set_data_dir", None, [P, S]),
        ("linphone_factory_set_config_dir", None, [P, S]),
        ("linphone_factory_create_core_3", P, [P, S, S, P]),
        ("linphone_factory_create_auth_info", P, [P, S, S, S, S, S, S]),
        ("linphone_core_add_auth_info", None, [P, P]),
        ("linphone_core_create_nat_policy", P, [P]),
        ("linphone_nat_policy_set_stun_server", None, [P, S]),
        ("linphone_nat_policy_enable_stun", None, [P, B]),
        ("linphone_nat_policy_enable_ice", None, [P, B]),
        ("linphone_core_set_nat_policy", None, [P, P]),
        ("linphone_core_set_use_files", None, [P, B]),
        ("linphone_core_set_play_file", None, [P, S]),
        ("linphone_core_enable_ipv6", None, [P, B]),
        ("linphone_core_start", I, [P]),
        ("linphone_core_get_global_state", I, [P]),
        ("linphone_core_invite", P, [P, S]),
        ("linphone_core_iterate", None, [P]),
        ("linphone_call_ref", P, [P]),
        ("linphone_call_unref", None, [P]),
        ("linphone_call_get_state", I, [P]),
        ("linphone_call_state_to_string", S, [I]),
        ("linphone_call_get_reason", I, [P]),
        ("linphone_call_get_stats", P, [P, I]),
        ("linphone_call_stats_get_ice_state", I, [P]),
        ("linphone_call_stats_unref", None, [P]),
        ("linphone_reason_to_string", S, [I]),
        ("linphone_core_terminate_all_calls", I, [P]),
        ("linphone_core_stop", None, [P]),
        ("linphone_core_unref", None, [P]),
    ]:
        fn = getattr(L, name)
        fn.restype, fn.argtypes = res, args
    return L


def call(text, verbose):
    pw_file = HERE / "sip-password.txt"
    if not pw_file.exists() or not pw_file.read_text(encoding="utf-8").strip():
        sys.exit(f"Put the password of {USER}@{DOMAIN} in {pw_file}")
    pw = pw_file.read_text(encoding="utf-8").strip()

    state = HERE / "state"
    state.mkdir(exist_ok=True)
    total, period = make_wav(text, state / "message.wav")
    (state / "linphonerc").write_text(RC, encoding="utf-8")

    L = load_liblinphone()
    enc = lambda s: str(s).encode("utf-8")
    L.linphone_logging_service_set_log_level(L.linphone_logging_service_get(), 4 if verbose else 16)
    f = L.linphone_factory_get()
    L.linphone_factory_set_top_resources_dir(f, enc((LIN / "share").as_posix()))  # grammars, sounds
    L.linphone_factory_set_data_dir(f, enc(state))
    L.linphone_factory_set_config_dir(f, enc(state))
    core = L.linphone_factory_create_core_3(f, enc(state / "linphonerc"),
                                            enc(LIN / "share/linphone/linphonerc-factory"), None)
    L.linphone_core_add_auth_info(core, L.linphone_factory_create_auth_info(
        f, enc(USER), None, enc(pw), None, None, enc(DOMAIN)))
    nat = L.linphone_core_create_nat_policy(core)
    L.linphone_nat_policy_set_stun_server(nat, b"stun.linphone.org")
    L.linphone_nat_policy_enable_stun(nat, 1)
    L.linphone_nat_policy_enable_ice(nat, 1)
    L.linphone_core_set_nat_policy(core, nat)
    L.linphone_core_set_use_files(core, 1)  # send the wav instead of the PC microphone
    L.linphone_core_set_play_file(core, enc(state / "message.wav"))
    L.linphone_core_enable_ipv6(core, 0)  # broken IPv6 makes connects hang
    L.linphone_core_start(core)
    deadline = time.time() + 15
    while L.linphone_core_get_global_state(core) != GLOBAL_ON:  # start is async
        if time.time() > deadline:
            sys.exit("Linphone core did not start")
        L.linphone_core_iterate(core)
        time.sleep(0.02)

    c = L.linphone_core_invite(core, TO.encode())
    if not c:
        sys.exit("invite failed")
    L.linphone_call_ref(c)

    def ice_in_progress():
        s = L.linphone_call_get_stats(c, 0)  # 0 = audio stream
        if not s:
            return True
        ice = L.linphone_call_stats_get_ice_state(s)
        L.linphone_call_stats_unref(s)
        return ice == ICE_IN_PROGRESS  # connected, failed or not used: nothing more to wait for

    t0, talk_start, talk_end, path_up, hung_up, last = time.time(), None, None, False, False, None
    while True:
        L.linphone_core_iterate(core)
        now = time.time()
        st = L.linphone_call_get_state(c)
        if st != last:
            print("call:", L.linphone_call_state_to_string(st).decode(), flush=True)
            last = st
        if st == STREAMS_RUNNING and talk_start is None:
            talk_start, talk_end = now, now + total
        if talk_start and not path_up and not ice_in_progress():
            path_up = True
            k = math.ceil(max(0.0, now - talk_start - LEAD) / period)  # first full repetition
            if k < REPS:
                talk_end = talk_start + LEAD + (k + 1) * period
            print(f"call: audio path up after {now - talk_start:.1f}s, playing repetition {k + 1}",
                  flush=True)
        if st in (ERROR, END, RELEASED):
            break
        timed_out = now > talk_end if talk_end else now - t0 > RING_TIMEOUT
        if timed_out and not hung_up:
            L.linphone_core_terminate_all_calls(core)
            hung_up = True
        time.sleep(0.02)

    reason = L.linphone_reason_to_string(L.linphone_call_get_reason(c)).decode()
    for _ in range(25):  # let the BYE go out
        L.linphone_core_iterate(core)
        time.sleep(0.02)
    L.linphone_call_unref(c)
    L.linphone_core_stop(core)
    L.linphone_core_unref(core)
    answered = talk_end is not None
    print("answered, message played" if answered else f"not answered ({reason})")
    return 0 if answered else 1


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "-v"]
    default = str(VOICE_FILE) if VOICE_FILE.is_file() else DEFAULT_MSG
    sys.exit(call(args[0] if args else default, "-v" in sys.argv))
