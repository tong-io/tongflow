/**
 * The TongFlow wordmark for the top-left of the canvas top bar.
 *
 * The wordmark is all caps, so its height is its cap height: 16px, per the
 * brand guide. The dark-ink version sits on the light theme and the white
 * version on the dark theme; the green triangle is the same in both.
 */
export function BrandWordmark() {
    return (
        <span className="flex h-10 shrink-0 items-center px-1 select-none">
            <img
                src="/brand/tongflow-wordmark.svg"
                alt="TongFlow"
                className="block h-4 w-auto dark:hidden"
                draggable={false}
            />
            <img
                src="/brand/tongflow-wordmark-white.svg"
                alt="TongFlow"
                className="hidden h-4 w-auto dark:block"
                draggable={false}
            />
        </span>
    );
}
