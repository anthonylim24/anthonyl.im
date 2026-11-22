// What the Liquid Glass look draws behind the page: the wallpaper the glass
// sits on. Loaded only while the look is on (a lazy chunk), never in the atlas.

export default function GlassLayer() {
  return <div className="trips-glass-wallpaper" aria-hidden />
}
