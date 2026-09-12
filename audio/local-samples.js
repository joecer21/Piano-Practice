// Local soft-piano sample manifest.
//
// Kept free of Tone.js so it can be validated directly: every filename here must
// resolve to a real file under public/samples (see tests/samples.spec.js).
//
// Filenames use "s" for sharps (ds3vl.mp3) rather than a literal "#", which a URL
// parses as a fragment delimiter. The previous workaround percent-encoded the "#"
// in this map and shipped a second, byte-identical copy of every affected file
// under the encoded name; only the raw-named file was ever served.

export const LOCAL_SAMPLE_BASE_URL = "samples/";

export const LOCAL_VL_URL_MAP = {
  A0: "a0vl.mp3",
  A1: "a1vl.mp3",
  A2: "a2vl.mp3",
  A3: "a3vl.mp3",
  A4: "a4vl.mp3",
  A5: "a5vl.mp3",
  A6: "a6vl.mp3",
  A7: "a7vl.mp3",
  C2: "c2vl.mp3",
  C3: "c3vl.mp3",
  C4: "c4vl.mp3",
  C5: "c5vl.mp3",
  "D#3": "ds3vl.mp3",
  "D#4": "ds4vl.mp3",
  "F#2": "fs2vl.mp3",
  "F#3": "fs3vl.mp3",
};

// Bright accent samples (vh = high velocity layer) used for rare emphasis hits.
export const LOCAL_VH_URL_MAP = {
  A0: "a0vh.mp3",
  A1: "a1vh.mp3",
  A3: "a3vh.mp3",
  A4: "a4vh.mp3",
  A5: "a5vh.mp3",
  A6: "a6vh.mp3",
  A7: "a7vh.mp3",
  B3: "b3vh.mp3",
  B4: "b4vh.mp3",
  B5: "b5vh.mp3",
  C2: "c2vh.mp3",
  C3: "c3vh.mp3",
  C5: "c5vh.mp3",
  "D#3": "ds3vh.mp3",
  "D#4": "ds4vh.mp3",
  "F#2": "fs2vh.mp3",
  "F#3": "fs3vh.mp3",
};
