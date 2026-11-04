# Pop-up comments: fill-in template

> Temporary file. Claude will delete it once the feature is built.

Fill in what you want and leave the rest blank. Blank entries are skipped.
You can write conditions in plain words. The "Things that can trigger it"
lines list what each interaction can already detect, but you can ask for
anything else too.

---

After loading page, tracked by sessionStorage, a modal should say "Click on any QR code to start", this acts as the tutorial and pre-empt for first-time visitors

## 2. Comments per interaction

Copy a `- When / Say` pair as many times as you need.

### Scam (`/scam/`): which QR code is the scam
Things that can trigger it: taps a code, picks the real scam, picks a safe
code, wrong picks in a row, all scams stamped, presses Reset, expands
the picture, opens and leaves without tapping anything.

- When: they only find one scam
  Say: Are you sure you have found all scam QR codes? (only appear once after they choose only one)
- When: they find both scams
  Say: You have found both scams! (only appear once when they find both scams, appear again if they reset the interaction and finish finding both qr codes)

### Angle (`/angle/`): DISTQRTED prism model maker
Things that can trigger it: turns the model, zooms, presses the
scan-view button, moves a slider (scan height / ridge length / prism
height) past a value, presses Reset.

- When: Anytime they change the value in the slider
  Say: The totem looks a bit weird...

### Color (`/color/`): QOLORFUL greyscale slider
Things that can trigger it: slider passes a level (e.g. halfway, where
everything is grey; the bottom, pure black and white), returns to full
colour.

- When: Anytime there is a change in the slider value
  Say: The world looks grey...
- When: The first time they exit the modal after they changed the value back to colorful
  Say: The world looks colorful!

### Handdrawn (`/handdrawn/`): QROSSWORD word search
Things that can trigger it: finds a word, finds a specific word, finds
N words, finds them all, taps a spot with no word, presses Reset,
expands.

- When: If they have not found all of the stations
  Say: It's good to take a break, you can continue finding the stations later
- When: After they finish
  Say: Congratulations! You found all of the stations!


### Tiles QR (`/tiles-qr/`): Coded Nyonya pattern maker
Things that can trigger it: places a tile, fills N squares, fills all 9,
removes a tile, presses Remove all, makes a specific pattern.

- When: Any change in pattern
  Say: The floor looks beautiful...
- When: If the change is the tile are all removed
  Say: The floor looks too clean

### Lenticular (`/lens-l/`, `/lens-c/`, `/lens-r/`): emoji views
Things that can trigger it: steps through N emoji, picks a specific
emoji, comes back to the eyes, which view (left / centre / right) it
happens in.

- When: Any change in the emoji
  Say: A new emoji discovered!

---

## 3. Anything else?

