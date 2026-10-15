# 🐪 Wednesdaze

Party games for friends who live too far apart to hang out on a Wednesday.
Everyone plays on their own iPhone, from anywhere. No App Store and no
install: you open a link. You can add it to your home screen and it runs
full-screen like a normal app.

Rounds are built to make you **laugh**, **compete**, **argue** and **team up**,
and they use the phone's hardware: camera, microphone, accelerometer, gyroscope,
compass and GPS.

## The games

| | Game | Vibe | Uses | What happens |
|---|---|---|---|---|
| 🕵️ | **Imposter** | argue · laugh | – | Everyone sees a category and a secret word, except one imposter who doesn't. Each person says one word on the call, then everyone votes. If the imposter is caught, they can still win by guessing the word. |
| 🤥 | **Two Truths & a Lie** | argue · laugh | – | Write two true things and one lie about yourself. Everyone gets grilled in turn, then the others guess the lie. |
| 🎚️ | **Spectrum** | team · argue | – | One person sees a secret spot on a scale (Cold ↔ Hot) and types a clue. Everyone else argues about where it lands. Everyone takes a turn giving the clue. |
| 🖍️ | **Doodle Telephone** | laugh | touch drawing | Write a phrase, draw someone else's, guess someone's drawing, and keep passing it around the circle. Then flip through every chain together. |
| 📸 | **Snap Judgment** | laugh · compete | camera | Everyone gets the same prompt ("the saddest thing in your fridge"), snaps a photo, then votes on the anonymous photos. |
| 🎙️ | **Sound Off** | laugh | mic | Record a 6-second sound effect ("a dolphin ordering at a drive-thru"). Everyone listens to the clips and votes. |
| 🫨 | **Shake Down** | compete | accelerometer | 10 seconds to shake your phone harder than anyone else, with live bars for everyone. |
| 🧭 | **Homing Pigeon** | compete · laugh | compass + GPS | Point your phone at your friends' houses across the state, plus a few world landmarks. The game tells you how many miles you'd have missed by. |
| 💣 | **Bomb Squad** | team | gyroscope | Everyone tilts their phone to hold a sliding ball inside a target ring. A wire is only cut while *all* of you are in your rings at once. Four wires: the rings start drifting, then sparks fly that knock your ball away. |
| 🌶️ | **Hot Takes** | argue | – | Rate a spicy statement from 0 to 10. The answers are revealed and the extremes get called out to defend themselves. Then everyone re-rates, and you score points for pulling people toward your take. |
| 👉 | **Most Likely To** | argue · laugh | – | "Who's most likely to fight a goose and lose?" Votes are shown with names attached. |
| 🎶 | **Pitch Imperfect** | compete · laugh | mic + speaker | The phone plays a note, you sing it back, and the phone scores you (any octave counts). |
| 🚨 | **Siren Song** | compete · laugh | mic + speaker | Hard-mode Pitch Imperfect: follow a pitch that slides, jumps and wobbles while your voice is drawn live on screen. |
| 🔢 | **Count Up** | team · laugh | – | Count to the target as a group, one tap at a time. If two people tap at the same moment, the count goes back to zero. |

**Start the Night** plays the lineup set in the lobby, with each vibe spread
evenly across the night, then crowns the Wednesday Champion. The host chooses
how many rounds of each game to include (0–3, where 0 leaves it out). The
host's phone remembers the lineup for next week. Repeat rounds of the same game
play back to back and start on their own after a short countdown. Tap
**▶ Play** on any game to play just that game.

During a round the host has three buttons:
- **Skip timer** moves on from the current step.
- **Skip game** (or **Next game**) drops the rest of the current game and
  goes to the next one.
- **End** goes back to the lobby.

## How a game night works

1. One person (the host) opens the site and taps **Start a new room**.
2. They tap **Send invite link** and drop it in the group chat.
3. Everyone opens the link, picks a name and an emoji, and joins.
4. Get on a group call, then the host taps **Start the Night**.

> **Run the call on a laptop, tablet or TV if you can.** iPhones won't let a
> web page use the mic or camera while a FaceTime/phone call is using them,
> so the Sound Off, Pitch Imperfect and Siren Song rounds work best when the phone is
> only running the game. The game rounds still work if you're on speaker,
> but the mic rounds will complain.

If someone's phone locks or they switch apps, they reopen it and drop right
back in with their score intact. If the host's phone dies, someone else gets
the host controls until the host comes back.

## Putting it online (about 5 minutes, free)

Phones need **HTTPS** for the camera, mic and motion sensors, so this needs a
real host instead of a laptop on your Wi-Fi. The easiest option:

### Render (free)

1. Push this repo to GitHub (it's already there if you're reading this on GitHub).
2. Go to [render.com](https://render.com), sign in with GitHub, then
   **New → Blueprint** and pick this repo. It reads `render.yaml`.
3. Wait for the deploy, then share the `https://wednesdaze-xxxx.onrender.com`
   URL with your friends.

On the free plan the server goes to sleep after 15 minutes of nobody using it.
The first person to open it on Wednesday waits about 30–60 seconds while it
wakes up, and after that it's instant. Rooms live in memory, so don't deploy
in the middle of a game night.

### Anywhere else

It's a single Node.js process with one dependency (`ws`). Anything that runs
Node 20+ and supports WebSockets works: Fly.io (`fly launch` uses the
`Dockerfile`), Railway, a VPS behind Caddy, etc. Set `PORT` if your host
wants something other than 3000.

## Running it locally

```bash
npm install
npm start            # http://localhost:3000
npm test             # plays every game end-to-end with bot players
```

Open a few browser windows to play against yourself. Desktop browsers have no
motion sensors, so the games fall back to tapping (Shake Down) and dragging
(Bomb Squad). To try it on a real phone during development, you'll need HTTPS:
`npx localtunnel --port 3000` or `cloudflared tunnel --url http://localhost:3000`
gives you a temporary https URL.

## How it's built

- **No build step.** The front end is plain HTML, CSS and ES modules in
  `public/`. It's a PWA (manifest + service worker), so "Add to Home Screen"
  gives an app icon and a full-screen launch.
- **Server-authoritative rooms.** `server/room.js` runs rooms, rounds, timers
  and scoring. The server sends each phone a full snapshot of the state, which
  makes reconnecting after a locked screen easy.
- **Each game is one file on each side.** The rules and scoring are in
  `server/games/<id>.js`, and the phone UI is in `public/js/games/<id>.js`.
- **Hardware access** (with all the iOS permission quirks) is in
  `public/js/sensors.js`.
- Photos are shrunk on the phone before uploading. Photos and voice clips are
  kept in server memory only for the current round and are deleted when the
  next round starts. Locations are rounded to about 1 km, used only for
  Homing Pigeon, and never shown to other players.
- Drawings from Doodle Telephone are uploaded as small JPEGs and kept only for
  that round, the same as photos.

### Adding a new game

1. Create `server/games/mygame.js` exporting `{ id, name, emoji, tags, sensors, needs, blurb, howTo, minPlayers, start(r), action(r, pid, msg), view(r, pid), check?(r) }`.
   The first tag decides where the game lands in a night (`compete`, `laugh`, `team` or `argue`).
   Use `r.setStep(name, ms, onTimeout)` to move through steps and
   `r.finish(points)` to end the round.
2. Register it in `server/games/index.js`, and set its default round count in `DEFAULT_ROUNDS`.
3. Create `public/js/games/mygame.js` exporting `{ mount(el, ctx) → { update(view, ctx), unmount() }, results(view, ctx), prepare?(ctx) }`
   and register it in `public/js/app.js`.
4. Add a test to `test/games.test.js`.

Prompts for every game are plain arrays at the top of each server file. Add
your group's inside jokes.
