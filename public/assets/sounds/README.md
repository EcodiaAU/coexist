# Sound Assets

Place sound files here (<50KB each). Used by `src/hooks/use-sound.ts`.

## Required files:
- `check-in.mp3` - wooden chime, played on QR check-in
- `send-message.mp3` - whoosh, played on chat message send
- `error.mp3` - soft bonk, played on errors
- `tier-up.mp3` - celebration sound, played on tier advancement
- `points.mp3` - subtle ping, played on points earned
- `tap.mp3` - soft click, played on interactive taps
- `success.mp3` - positive confirmation sound

## Requirements:
- All files must be <50KB
- MP3 format for maximum compatibility
- Lazy loaded via Web Audio API
- Respect system mute + user settings toggle
