# Club Penguin Legacy Trainer

Forked from [giacomozama/club-penguin-legacy-trainer](https://github.com/giacomozama/club-penguin-legacy-trainer).

I decided to update this project because I was in a state of flu-based boredom and wanted to get it working on my Mac. The original used Flasm which doesn't work on Apple Silicon, so I rewrote it to use FFDec instead.

## How It Works

This is an Electron app that:

1. Downloads original .swf game files from Club Penguin Legacy
2. Uses [FFDec](https://github.com/jindrapetrik/jpexs-decompiler) to decompile, modify, and recompile the ActionScript
3. Runs a local server to serve the modified .swf files
4. Intercepts game requests and redirects them to your local server

## Available Hacks

- **HydroHopper 1K Coins** - Always get 1000 coins when the game ends
- **Catchin' Waves 5K Coins** - Always get 5000 coins when the game ends

## Requirements

- Node.js
- Java (for FFDec)

## Installation

```bash
# Install Java (macOS)
brew install openjdk

# Clone the repo
git clone https://github.com/jofl1/club-penguin-legacy-trainer.git
cd club-penguin-legacy-trainer

# Install dependencies
npm install

# Run
npm start
```

FFDec will automatically download on first run.

## Disclaimer

This is for educational purposes only. Use at your own risk.
