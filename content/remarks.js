/* ==========================================================================
   remarks.js — the pop-up comments: their on/off switches and wording.
   The logic that decides when each one shows is in
   assets/js/obelisk/remarks.js; edit this file to change what they say or
   to turn them off.

   REMARKS_ON   false turns every comment off at once.
   Each entry:
     on     false turns just that comment off
     text   what it says
   A comment shows, centred on the screen behind the modal, as soon as
   the change it talks about happens, and goes again if the change is
   undone. Its countdown starts once the modal closes.
   ========================================================================== */

export const REMARKS_ON = true;

// seconds a comment stays before it fades by itself (0 = until clicked)
export const REMARK_SECONDS = 3;

export const remarks = {
  // first visit in this browser tab, once the obelisk has loaded; goes
  // with the timer below, or at the first touch, click, scroll or key
  tutorial: {
    on: true,
    text: "Welcome to Coded Life!\n\nClick on any QR code to start",
  },

  // Scam: once per tab, a visit that stamped only the first scam code
  scamOne: {
    on: true,
    text: "Are you sure you have found all of the scam QR codes?",
  },
  // Scam: a visit that stamped the second; again after a Reset and refind
  scamBoth: {
    on: true,
    text: "You have found both scams!",
  },

  // Angle: any slider change during the visit that leaves it off the original shape
  angleChanged: {
    on: true,
    text: "The totem looks a bit weird",
  },
  // Angle: opened off the original shape and left back on it
  angleBack: {
    on: true,
    text: "The totem is back to normal",
  },

  // Color: opened at full colour and left somewhere grey
  colorGrey: {
    on: true,
    text: "The world looks grey",
  },
  // Color: opened grey and left at full colour
  colorBack: {
    on: true,
    text: "The world is so colourful",
  },

  // QROSSWORD: the found list changed and some stations are still to find
  handdrawnBreak: {
    on: true,
    text: "It's good to take a break, you can continue finding the stations later",
  },
  // QROSSWORD: a visit that found the last station
  handdrawnDone: {
    on: true,
    text: "Congratulations! You found all of the MRT stations!",
  },

  // Tiles: the pattern changed during the visit
  tilesChanged: {
    on: true,
    text: "The floor looks beautiful",
  },
  // Tiles: ... and was left with no tiles at all
  tilesEmpty: {
    on: true,
    text: "The floor looks too clean",
  },

  // Lenticular: the emoji changed during the visit
  lensChanged: {
    on: true,
    text: "A new emoji discovered",
  },
};
