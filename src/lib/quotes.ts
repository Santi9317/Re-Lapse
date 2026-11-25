export type Quote = {
  id: string;
  text: string;
  author: string;
  emoji: string;
};

export const QUOTES: Quote[] = [
  { id: "adams-make", text: "You don't take a photograph, you make it.", author: "Ansel Adams", emoji: "📷" },
  { id: "adams-stand", text: "A good photograph is knowing where to stand.", author: "Ansel Adams", emoji: "📍" },
  { id: "adams-rules", text: "There are no rules for good photographs, there are only good photographs.", author: "Ansel Adams", emoji: "📏" },
  { id: "adams-crop", text: "Twelve significant photographs in any one year is a good crop.", author: "Ansel Adams", emoji: "🌾" },
  { id: "adams-silence", text: "When words become unclear, I shall focus with photographs. When images become inadequate, I shall be content with silence.", author: "Ansel Adams", emoji: "🤫" },
  { id: "adams-believe", text: "Not everybody trusts paintings but people believe photographs.", author: "Ansel Adams", emoji: "🖼️" },
  { id: "adams-landscape", text: "Landscape photography is the supreme test of the photographer, and often the supreme disappointment.", author: "Ansel Adams", emoji: "🏔️" },
  { id: "adams-words", text: "A true photograph need not be explained, nor can it be contained in words.", author: "Ansel Adams", emoji: "🤐" },
  { id: "adams-two", text: "There are always two people in every picture: the photographer and the viewer.", author: "Ansel Adams", emoji: "👥" },
  { id: "adams-loved", text: "We don't make a photograph just with a camera. We bring to the act of photography all the books we have read, the movies we have seen, the music we have heard, the people we have loved.", author: "Ansel Adams", emoji: "📚" },
  { id: "lange-see", text: "The camera is an instrument that teaches people how to see without a camera.", author: "Dorothea Lange", emoji: "👁️" },
  { id: "lange-instant", text: "Photography takes an instant out of time, altering life by holding it still.", author: "Dorothea Lange", emoji: "⏳" },
  { id: "arbus-secret", text: "A photograph is a secret about a secret. The more it tells you the less you know.", author: "Diane Arbus", emoji: "🔐" },
  { id: "arbus-see", text: "I really believe there are things nobody would see if I didn't photograph them.", author: "Diane Arbus", emoji: "🔎" },
  { id: "arbus-intended", text: "I never have taken a picture I've intended. They're always better or worse.", author: "Diane Arbus", emoji: "🎲" },
  { id: "capa-close", text: "If your pictures aren't good enough, you aren't close enough.", author: "Robert Capa", emoji: "🎯" },
  { id: "hcb-worst", text: "Your first 10,000 photographs are your worst.", author: "Henri Cartier-Bresson", emoji: "🔟" },
  { id: "hcb-fraction", text: "To me, photography is the simultaneous recognition, in a fraction of a second, of the significance of an event.", author: "Henri Cartier-Bresson", emoji: "⚡" },
  { id: "hcb-meditation", text: "Photography is an immediate reaction, drawing is a meditation.", author: "Henri Cartier-Bresson", emoji: "✏️" },
  { id: "hcb-luck", text: "Of course it's all luck.", author: "Henri Cartier-Bresson", emoji: "🍀" },
  { id: "hcb-vanishing", text: "Photographers deal in things which are continually vanishing, and when they have vanished there is no contrivance on earth which can make them come back again.", author: "Henri Cartier-Bresson", emoji: "💨" },
  { id: "hcb-eye", text: "It is an illusion that photos are made with the camera… they are made with the eye, heart and head.", author: "Henri Cartier-Bresson", emoji: "💓" },
  { id: "hcb-breath", text: "To photograph is to hold one's breath, when all faculties converge to capture fleeting reality.", author: "Henri Cartier-Bresson", emoji: "😮" },
  { id: "erwitt-observe", text: "To me, photography is an art of observation. It's about finding something interesting in an ordinary place.", author: "Elliott Erwitt", emoji: "👀" },
  { id: "erwitt-words", text: "The whole point of taking pictures is so that you don't have to explain things with words.", author: "Elliott Erwitt", emoji: "💬" },
  { id: "frank-humanity", text: "There is one thing the photograph must contain, the humanity of the moment.", author: "Robert Frank", emoji: "🤝" },
  { id: "frank-poem", text: "When people look at my pictures I want them to feel the way they do when they want to read a line of a poem twice.", author: "Robert Frank", emoji: "📜" },
  { id: "cunningham-tomorrow", text: "Which of my photographs is my favorite? The one I'm going to take tomorrow.", author: "Imogen Cunningham", emoji: "🌅" },
  { id: "stieglitz-subtle", text: "In photography there is a reality so subtle that it becomes more real than reality.", author: "Alfred Stieglitz", emoji: "🌀" },
  { id: "avedon-truth", text: "All photographs are accurate. None of them is the truth.", author: "Richard Avedon", emoji: "⚖️" },
  { id: "avedon-opinion", text: "A portrait is not a likeness. The moment an emotion or fact is transformed into a photograph it is no longer a fact but an opinion.", author: "Richard Avedon", emoji: "🗣️" },
  { id: "avedon-me", text: "My portraits are more about me than they are about the people I photograph.", author: "Richard Avedon", emoji: "🪞" },
  { id: "sontag-memento", text: "All photographs are memento mori.", author: "Susan Sontag", emoji: "🕯️" },
  { id: "sontag-discloses", text: "The painter constructs, the photographer discloses.", author: "Susan Sontag", emoji: "🔓" },
  { id: "leibovitz-love", text: "A thing that you see in my pictures is that I was not afraid to fall in love with these people.", author: "Annie Leibovitz", emoji: "💕" },
  { id: "leibovitz-looking", text: "The camera makes you forget you're there. It's not like you are hiding but you forget, you are just looking so much.", author: "Annie Leibovitz", emoji: "🫥" },
  { id: "winogrand-look", text: "I photograph to find out what something will look like photographed.", author: "Garry Winogrand", emoji: "🤔" },
  { id: "winogrand-edges", text: "Photography is about finding out what can happen in the frame. When you put four edges around some facts, you change those facts.", author: "Garry Winogrand", emoji: "🔳" },
  { id: "weston-walk", text: "To consult the rules of composition before making a picture is a little like consulting the law of gravitation before going for a walk.", author: "Edward Weston", emoji: "🚶" },
  { id: "evans-stare", text: "Stare. It is the way to educate your eye, and more. Stare, pry, listen, eavesdrop. Die knowing something. You are not here long.", author: "Walker Evans", emoji: "👁️" },
  { id: "arnold-instrument", text: "It is the photographer, not the camera, that is the instrument.", author: "Eve Arnold", emoji: "🎛️" },
  { id: "karsh-heart", text: "Look and think before opening the shutter. The heart and mind are the true lens of the camera.", author: "Yousuf Karsh", emoji: "💓" },
  { id: "karsh-dark", text: "Character, like a photograph, develops in darkness.", author: "Yousuf Karsh", emoji: "🌑" },
  { id: "hine-words", text: "If I could tell the story in words, I wouldn't need to lug around a camera.", author: "Lewis Hine", emoji: "🎒" },
  { id: "siskind-loving", text: "Photography is a way of feeling, of touching, of loving. What you have caught on film is captured forever. It remembers little things, long after you have forgotten everything.", author: "Aaron Siskind", emoji: "🧠" },
  { id: "eastman-light", text: "Light makes photography. Embrace light. Admire it. Love it. But above all, know light.", author: "George Eastman", emoji: "💡" },
  { id: "eastman-button", text: "You press the button, we do the rest.", author: "George Eastman", emoji: "🔘" },
  { id: "holmes-mirror", text: "The daguerreotype is a mirror with a memory.", author: "Oliver Wendell Holmes Sr.", emoji: "🪞" },
  { id: "godard-truth", text: "Photography is truth. The cinema is truth twenty-four times per second.", author: "Jean-Luc Godard", emoji: "🎬" },
  { id: "mccullin-feeling", text: "Photography for me is not looking, it's feeling. If you can't feel what you're looking at, then you're never going to get others to feel anything when they look at your pictures.", author: "Don McCullin", emoji: "💔" },
  { id: "parks-weapon", text: "I picked up a camera because it was my choice of weapons against what I hated most about the universe: racism, intolerance, poverty.", author: "Gordon Parks", emoji: "✊" },
  { id: "parks-subject", text: "The subject matter is so much more important than the photographer.", author: "Gordon Parks", emoji: "🌟" },
  { id: "white-else", text: "One should not only photograph things for what they are but for what else they are.", author: "Minor White", emoji: "🔮" },
  { id: "haas-limits", text: "There is only you and your camera. The limitations in your photography are in yourself, for what we see is what we are.", author: "Ernst Haas", emoji: "🪞" },
  { id: "kertesz-tool", text: "The camera is my tool. Through it I give a reason to everything around me.", author: "André Kertész", emoji: "🔧" },
  { id: "abbott-alone", text: "Photography can never grow up if it imitates some other medium. It has to walk alone; it has to be itself.", author: "Berenice Abbott", emoji: "🚶" },
  { id: "manray-why", text: "Of course, there will always be those who look only at technique, who ask how, while others of a more curious nature will ask why.", author: "Man Ray", emoji: "❓" },
  { id: "eisenstaedt-click", text: "It is more important to click with people than to click the shutter.", author: "Alfred Eisenstaedt", emoji: "😊" },
  { id: "smith-horizon", text: "Never have I found the limits of the photographic potential. Every horizon, upon being reached, reveals another beckoning in the distance.", author: "W. Eugene Smith", emoji: "🌄" },
  { id: "penn-cake", text: "Photographing a cake can be art.", author: "Irving Penn", emoji: "🍰" },
  { id: "leiter-uncertain", text: "I like it when one is not certain what one sees.", author: "Saul Leiter", emoji: "🌧️" },
  { id: "goldin-caress", text: "For me it is not a detachment to take a picture. It's a way of touching somebody. It's a caress.", author: "Nan Goldin", emoji: "🫶" },
  { id: "doisneau-street", text: "The marvels of daily life are exciting; no movie director can arrange the unexpected that you find in the street.", author: "Robert Doisneau", emoji: "🏙️" },
  { id: "hockney-cyclops", text: "Photography is all right if you don't mind looking at the world from the point of view of a paralysed cyclops, for a split second.", author: "David Hockney", emoji: "👁️" },
  { id: "maisel-out", text: "If you are out there shooting, things will happen for you. If you're not out there, you'll only hear about it.", author: "Jay Maisel", emoji: "🚶" },
  { id: "maisel-now", text: "Always shoot it now. It won't be the same when you go back.", author: "Jay Maisel", emoji: "⏱️" },
  { id: "maisel-interesting", text: "If you want to make more interesting pictures, become a more interesting person.", author: "Jay Maisel", emoji: "✨" },
  { id: "mark-soul", text: "I just think it's important to be direct and honest with people about why you're photographing them and what you're doing. After all, you are taking some of their soul.", author: "Mary Ellen Mark", emoji: "🕯️" },
  { id: "model-detection", text: "The camera is an instrument of detection. We photograph not only what we know, but also what we don't know.", author: "Lisette Model", emoji: "🔍" },
  { id: "sander-truth", text: "I hate nothing more than sugary photographs with tricks, poses and effects. So let me honestly tell the truth about our age and the people of our age.", author: "August Sander", emoji: "🧂" },
  { id: "brandt-sport", text: "I am not interested in rules or conventions. Photography is not a sport.", author: "Bill Brandt", emoji: "🚫" },
  { id: "steichen-portrait", text: "A portrait is not made in the camera but on either side of it.", author: "Edward Steichen", emoji: "🧍" },
  { id: "meiselas-excuse", text: "The camera is an excuse to be someplace you otherwise don't belong.", author: "Susan Meiselas", emoji: "🚪" },
  { id: "uzzle-love", text: "Photography is a love affair with life.", author: "Burk Uzzle", emoji: "💖" },
  { id: "lewis-too", text: "Friendship is born at that moment when one person says to another, “What! You too? I thought I was the only one.”", author: "C.S. Lewis", emoji: "✨" },
  { id: "lewis-survival", text: "Friendship is unnecessary, like philosophy, like art. It has no survival value; rather it is one of those things which give value to survival.", author: "C.S. Lewis", emoji: "🎨" },
  { id: "emerson-be", text: "The only way to have a friend is to be one.", author: "Ralph Waldo Emerson", emoji: "🌱" },
  { id: "thoreau-meanings", text: "The language of friendship is not words but meanings.", author: "Henry David Thoreau", emoji: "💬" },
  { id: "thoreau-simply", text: "The most I can do for my friend is simply to be his friend.", author: "Henry David Thoreau", emoji: "🤝" },
  { id: "aristotle-soul", text: "What is a friend? A single soul dwelling in two bodies.", author: "Aristotle", emoji: "👥" },
  { id: "keller-dark", text: "I would rather walk with a friend in the dark than alone in the light.", author: "Helen Keller", emoji: "🌙" },
  { id: "proust-gardeners", text: "Let us be grateful to the people who make us happy; they are the charming gardeners who make our souls blossom.", author: "Marcel Proust", emoji: "🌸" },
  { id: "wilde-diary", text: "Memory is the diary that we all carry about with us.", author: "Oscar Wilde", emoji: "📔" },
  { id: "cather-realities", text: "Some memories are realities, and are better than anything that can ever happen to one again.", author: "Willa Cather", emoji: "🌙" },
  { id: "barrie-roses", text: "God gave us memory so that we might have roses in December.", author: "J.M. Barrie", emoji: "🌹" },
  { id: "montgomery-lost", text: "Nothing is ever really lost to us as long as we remember it.", author: "L.M. Montgomery", emoji: "🔑" },
  { id: "pavese-moments", text: "We do not remember days, we remember moments.", author: "Cesare Pavese", emoji: "✨" },
  { id: "nin-world", text: "Each friend represents a world in us, a world possibly not born until they arrive, and it is only by this meeting that a new world is born.", author: "Anaïs Nin", emoji: "🌐" },
  { id: "woolf-friends", text: "Some people go to priests; others to poetry; I to my friends.", author: "Virginia Woolf", emoji: "☕" },
  { id: "euripides-trouble", text: "Friends show their love in times of trouble, not in happiness.", author: "Euripides", emoji: "🌧️" },
  { id: "austen-halves", text: "There is nothing I would not do for those who are really my friends. I have no notion of loving people by halves; it is not my nature.", author: "Jane Austen", emoji: "💌" },
  { id: "twain-ideal", text: "Good friends, good books, and a sleepy conscience: this is the ideal life.", author: "Mark Twain", emoji: "📚" },
  { id: "wilson-cement", text: "Friendship is the only cement that will ever hold the world together.", author: "Woodrow Wilson", emoji: "🌍" },
  { id: "angelou-feel", text: "I've learned that people will forget what you said, people will forget what you did, but people will never forget how you made them feel.", author: "Maya Angelou", emoji: "💛" },
  { id: "rogers-helpers", text: "Look for the helpers. You will always find people who are helping.", author: "Fred Rogers", emoji: "🛟" },
  { id: "welty-snapshot", text: "A good snapshot keeps a moment from running away.", author: "Eudora Welty", emoji: "📸" },
  { id: "warhol-changes", text: "The best thing about a picture is that it never changes, even when the people in it do.", author: "Andy Warhol", emoji: "🖼️" },
  { id: "lagerfeld-gone", text: "What I like about photographs is that they capture a moment that's gone forever, impossible to reproduce.", author: "Karl Lagerfeld", emoji: "⌛" },
  { id: "porchia-memory", text: "One lives in the hope of becoming a memory.", author: "Antonio Porchia", emoji: "🕯️" },
  { id: "campbell-hearts", text: "To live in hearts we leave behind is not to die.", author: "Thomas Campbell", emoji: "💖" },
  { id: "milne-sure", text: "“Nothing,” said Piglet, taking Pooh's paw. “I just wanted to be sure of you.”", author: "A.A. Milne", emoji: "🐾" },
  { id: "atwood-stories", text: "In the end, we'll all become stories.", author: "Margaret Atwood", emoji: "📖" },
  { id: "steinbeck-trips", text: "People don't take trips, trips take people.", author: "John Steinbeck", emoji: "🧳" },
  { id: "picasso-dust", text: "The purpose of art is washing the dust of daily life off our souls.", author: "Pablo Picasso", emoji: "🧼" },
  { id: "barthes-once", text: "What the Photograph reproduces to infinity has occurred only once.", author: "Roland Barthes", emoji: "♾️" },
  { id: "berger-seeing", text: "Every image embodies a way of seeing.", author: "John Berger", emoji: "👀" },
  { id: "exupery-heart", text: "It is only with the heart that one can see rightly; what is essential is invisible to the eye.", author: "Antoine de Saint-Exupéry", emoji: "🦊" },
  { id: "butler-portrait", text: "Every man's work, whether it be literature or music or pictures or architecture or anything else, is always a portrait of himself.", author: "Samuel Butler", emoji: "🪞" },
  { id: "proverbs-friend", text: "A friend loves at all times.", author: "Proverbs 17:17", emoji: "💛" },
  { id: "lec-memories", text: "You can close your eyes to reality but not to memories.", author: "Stanisław Jerzy Lec", emoji: "👁️" },
  { id: "ford-best", text: "My best friend is the one who brings out the best in me.", author: "Henry Ford", emoji: "🌟" },
  { id: "winchell-walks", text: "A real friend is one who walks in when the rest of the world walks out.", author: "Walter Winchell", emoji: "🚪" },
  { id: "dietrich-four", text: "It's the friends you can call up at four a.m. that matter.", author: "Marlene Dietrich", emoji: "🌙" },
];

function assertQuotes(quotes: Quote[]) {
  if (quotes.length < 80) throw new Error("Inspiration needs at least 80 quotes.");
  const ids = new Set<string>();
  const texts = new Set<string>();
  for (const quote of quotes) {
    if (!quote.id || !quote.text.trim() || !quote.author.trim() || !quote.emoji.trim()) {
      throw new Error("A quote is missing its line, its author, or its emoji.");
    }
    if (/\s/.test(quote.emoji)) throw new Error(`Quote ${quote.id} has more than one emoji.`);
    if (ids.has(quote.id) || texts.has(quote.text)) throw new Error(`Quote ${quote.id} repeats another.`);
    ids.add(quote.id);
    texts.add(quote.text);
  }
}

assertQuotes(QUOTES);

export function pickQuote(lastId: string | null, random: () => number = Math.random): Quote {
  const pool = lastId ? QUOTES.filter((quote) => quote.id !== lastId) : QUOTES;
  const source = pool.length > 0 ? pool : QUOTES;
  const unit = Math.min(0.999999, Math.max(0, random()));
  const index = Math.floor(unit * source.length);
  const quote = source[index];
  if (!quote) throw new Error("The sleeve has no lines left.");
  return quote;
}

/** Shared with the sleeve, so the next line is a different one. */
export const INSPIRATION_KEY = "relapse.inspiration";

export type QuoteMemory = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** One existing line, chosen when the banner or the sleeve asks. */
export function drawInspiration(storage: QuoteMemory, random: () => number = Math.random): Quote {
  let lastId: string | null = null;
  try {
    lastId = storage.getItem(INSPIRATION_KEY);
  } catch {
    lastId = null;
  }
  const quote = pickQuote(lastId, random);
  try {
    storage.setItem(INSPIRATION_KEY, quote.id);
  } catch {
    /* the next open can repeat if this device refuses storage */
  }
  return quote;
}
