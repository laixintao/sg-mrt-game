# Singapore MRT Map Quiz

React frontend game built with Vite. No backend.

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite.

## Build

```bash
npm run build:data
npm run build
npm run preview
```

## Game Loop

- The game opens in an official-style schematic MRT map.
- Switch between `Official Style` and `Geographic` map modes at any time.
- Click a station dot on the map.
- Type the station name with autocomplete support.
- Correct answers reveal the label permanently across both map modes.
- Geographic mode shows the Singapore coastline and major waterways.
- Finish by revealing the whole map.
