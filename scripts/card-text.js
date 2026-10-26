/** Fit the actual rendered HTML, including paragraphs, lists and enriched rules. */
export function fitCardText(card) {
    const text = card.querySelector('[data-card-description]');
    if (!card.isConnected || !text || !text.clientWidth || !text.clientHeight) return;

    const fits = () => text.scrollHeight <= text.clientHeight && text.scrollWidth <= text.clientWidth;
    const maximum = 14;
    text.style.fontSize = `${maximum}px`;
    if (fits()) return;

    // Find the largest size that fits this card, rather than estimating by character count.
    let low = 0.5;
    let high = maximum;
    for (let step = 0; step < 9; step += 1) {
        const size = (low + high) / 2;
        text.style.fontSize = `${size}px`;
        if (fits()) low = size;
        else high = size;
    }
    text.style.fontSize = `${Math.floor(low * 4) / 4}px`;
}
