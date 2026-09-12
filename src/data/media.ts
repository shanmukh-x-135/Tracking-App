import type { ActivityItem, Book, Game, Media, MediaList, Movie, Review, TvSeries, User } from "@/types/media";

const img = (id: string, w = 700) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=85`;

export const users: User[] = [
  { id: "u1", username: "alexchen", displayName: "Alex Chen", avatarUrl: "https://i.pravatar.cc/160?img=12", bio: "Films, strange worlds, and perfect endings." },
  { id: "u2", username: "samira", displayName: "Sam Rivera", avatarUrl: "https://i.pravatar.cc/160?img=47" },
  { id: "u3", username: "mayareads", displayName: "Maya Okafor", avatarUrl: "https://i.pravatar.cc/160?img=32" },
];

export const movies: Movie[] = [
  { id:"dune-part-two", mediaType:"movie", title:"Dune: Part Two", posterUrl:img("photo-1500530855697-b586d89ba3ee"), backdropUrl:img("photo-1519608487953-e999c86e7455",1800), releaseYear:2024, genres:["Science Fiction","Adventure"], description:"Paul Atreides unites with Chani and the Fremen while seeking revenge against those who destroyed his family.", averageRating:4.6, ratingCount:182430, popularity:99, creators:["Denis Villeneuve"], runtime:166, director:"Denis Villeneuve", releaseDate:"2024-03-01" },
  { id:"perfect-days", mediaType:"movie", title:"Perfect Days", posterUrl:img("photo-1500534623283-312aade485b7"), releaseYear:2023, genres:["Drama"], description:"A quiet portrait of routine, music, and unexpected encounters in Tokyo.", averageRating:4.3, ratingCount:48200, creators:["Wim Wenders"], runtime:124, director:"Wim Wenders", releaseDate:"2023-12-22" },
  { id:"past-lives", mediaType:"movie", title:"Past Lives", posterUrl:img("photo-1470770841072-f978cf4d019e"), releaseYear:2023, genres:["Drama","Romance"], description:"Two childhood friends reunite in New York for one fateful week.", averageRating:4.2, ratingCount:118300, creators:["Celine Song"], runtime:106, director:"Celine Song", releaseDate:"2023-06-02" },
  { id:"aftersun", mediaType:"movie", title:"Aftersun", posterUrl:img("photo-1500534623283-312aade485b7"), releaseYear:2022, genres:["Drama"], description:"A daughter reflects on a holiday she took with her father twenty years earlier.", averageRating:4.5, ratingCount:96600, creators:["Charlotte Wells"], runtime:102, director:"Charlotte Wells", releaseDate:"2022-10-21" },
];

export const series: TvSeries[] = [
  { id:"severance", mediaType:"tv", title:"Severance", posterUrl:img("photo-1497366754035-f200968a6e72"), backdropUrl:img("photo-1497366811353-6870744d04b2",1800), releaseYear:2022, genres:["Drama","Mystery"], description:"Office workers have surgically divided their work and personal memories, until a mystery forces them to confront both lives.", averageRating:4.7, ratingCount:143100, creators:["Dan Erickson"], seasons:2, episodeCount:19, status:"returning", network:"Apple TV+", currentSeason:2, nextEpisode:"S02E10" },
  { id:"the-bear", mediaType:"tv", title:"The Bear", posterUrl:img("photo-1414235077428-338989a2e8c0"), releaseYear:2022, genres:["Drama","Comedy"], description:"A young chef returns home to run his family sandwich shop.", averageRating:4.5, ratingCount:215800, creators:["Christopher Storer"], seasons:4, episodeCount:38, status:"returning", network:"FX" },
  { id:"house", mediaType:"tv", title:"House", posterUrl:img("photo-1576091160399-112ba8d25d1d"), releaseYear:2004, genres:["Drama","Mystery"], description:"An unconventional diagnostician leads a team solving medical puzzles.", averageRating:4.4, ratingCount:390500, creators:["David Shore"], seasons:8, episodeCount:177, status:"ended", network:"Fox" },
  { id:"shogun", mediaType:"tv", title:"Shōgun", posterUrl:img("photo-1528360983277-13d401cdc186"), releaseYear:2024, genres:["Drama","History"], description:"Power, loyalty, and fate converge in feudal Japan.", averageRating:4.6, ratingCount:129400, creators:["Rachel Kondo","Justin Marks"], seasons:1, episodeCount:10, status:"returning", network:"FX" },
];

export const games: Game[] = [
  { id:"red-dead-redemption-2", mediaType:"game", title:"Red Dead Redemption 2", posterUrl:img("photo-1518709268805-4e9042af9f23"), backdropUrl:img("photo-1500530855697-b586d89ba3ee",1800), releaseYear:2018, genres:["Action","Adventure"], description:"An outlaw struggles to survive as the age of the American frontier comes to an end.", averageRating:4.8, ratingCount:427100, creators:["Rockstar Games"], platforms:["PC","PlayStation","Xbox"], developer:"Rockstar Games", publisher:"Rockstar Games", estimatedPlaytime:60, releaseDate:"2018-10-26" },
  { id:"clair-obscur", mediaType:"game", title:"Clair Obscur: Expedition 33", posterUrl:img("photo-1518709268805-4e9042af9f23"), releaseYear:2025, genres:["RPG","Fantasy"], description:"An expedition sets out to destroy the Paintress before she erases another generation.", averageRating:4.7, ratingCount:86400, creators:["Sandfall Interactive"], platforms:["PC","PlayStation 5","Xbox Series"], developer:"Sandfall Interactive", publisher:"Kepler Interactive", estimatedPlaytime:32, releaseDate:"2025-04-24" },
  { id:"hades-ii", mediaType:"game", title:"Hades II", posterUrl:img("photo-1534447677768-be436bb09401"), releaseYear:2025, genres:["Roguelike","Action"], description:"The Princess of the Underworld battles beyond the realm of the dead.", averageRating:4.6, ratingCount:70200, creators:["Supergiant Games"], platforms:["PC"], developer:"Supergiant Games", publisher:"Supergiant Games", estimatedPlaytime:28, releaseDate:"2025-05-06" },
  { id:"zelda-totk", mediaType:"game", title:"Tears of the Kingdom", posterUrl:img("photo-1500530855697-b586d89ba3ee"), releaseYear:2023, genres:["Adventure","Fantasy"], description:"Link explores the land and skies of Hyrule in a vast new adventure.", averageRating:4.7, ratingCount:318900, creators:["Nintendo"], platforms:["Nintendo Switch"], developer:"Nintendo EPD", publisher:"Nintendo", estimatedPlaytime:59, releaseDate:"2023-05-12" },
];

export const books: Book[] = [
  { id:"dune", mediaType:"book", title:"Dune", posterUrl:img("photo-1544947950-fa07a98d237f"), backdropUrl:img("photo-1509316785289-025f5b846b35",1800), releaseYear:1965, genres:["Science Fiction","Classic"], description:"A sweeping story of politics, ecology, religion, and power on the desert planet Arrakis.", averageRating:4.5, ratingCount:1200300, creators:["Frank Herbert"], authors:["Frank Herbert"], pageCount:604, publicationDate:"1965-08-01", isbn:"9780441172719", series:"Dune" },
  { id:"normal-people", mediaType:"book", title:"Normal People", posterUrl:img("photo-1512820790803-83ca734da794"), releaseYear:2018, genres:["Literary Fiction","Romance"], description:"The magnetic, complicated relationship between two people from a small Irish town.", averageRating:4.1, ratingCount:824100, creators:["Sally Rooney"], authors:["Sally Rooney"], pageCount:288, publicationDate:"2018-08-28" },
  { id:"the-will-to-change", mediaType:"book", title:"The Will to Change", posterUrl:img("photo-1524578271613-d550eacf6090"), releaseYear:2004, genres:["Essays","Psychology"], description:"bell hooks examines masculinity, love, and the courage to change.", averageRating:4.6, ratingCount:38100, creators:["bell hooks"], authors:["bell hooks"], pageCount:188, publicationDate:"2004-01-06" },
  { id:"tomorrow", mediaType:"book", title:"Tomorrow, and Tomorrow, and Tomorrow", posterUrl:img("photo-1516979187457-637abb4f9353"), releaseYear:2022, genres:["Literary Fiction"], description:"Two friends build worlds together through art, games, success, and loss.", averageRating:4.3, ratingCount:593400, creators:["Gabrielle Zevin"], authors:["Gabrielle Zevin"], pageCount:401, publicationDate:"2022-07-05" },
];

export const allMedia: Media[] = [...movies, ...series, ...games, ...books];
export const mediaById = (id: string) => allMedia.find((item) => item.id === id);

export const reviews: Review[] = [
  { id:"r1", user:users[0], mediaId:"dune-part-two", rating:4.5, body:"A monumental spectacle that still finds room for quiet dread. Every frame feels carved from sand and prophecy.", isSpoiler:false, likes:842, comments:38, createdAt:"2h" },
  { id:"r2", user:users[2], mediaId:"normal-people", rating:4, body:"Tender, frustrating, painfully observant. Rooney understands everything people almost say to each other.", isSpoiler:false, likes:391, comments:21, createdAt:"5h" },
  { id:"r3", user:users[1], mediaId:"red-dead-redemption-2", rating:5, body:"Finished after 78 hours. I did not expect a game this enormous to feel this personal by the end.", isSpoiler:false, likes:1204, comments:94, createdAt:"Yesterday" },
];

export const activities: ActivityItem[] = [
  { id:"a1", kind:"rated_movie", user:users[0], media:movies[0], rating:4.5, createdAt:"18m" },
  { id:"a2", kind:"completed_game", user:users[1], media:games[0], rating:5, createdAt:"1h" },
  { id:"a3", kind:"reviewed_media", user:users[2], media:books[1], rating:4, excerpt:"Tender, frustrating, painfully observant.", createdAt:"5h" },
];

export const lists: MediaList[] = [
  { id:"worlds", title:"Favourite Fictional Worlds", description:"Places I keep wanting to return to.", owner:users[0], mediaIds:["dune","zelda-totk","dune-part-two","red-dead-redemption-2"], isPrivate:false },
  { id:"2026", title:"Best Things I Experienced in 2026", description:"Across every medium, in the order they stayed with me.", owner:users[0], mediaIds:["perfect-days","severance","clair-obscur","the-will-to-change"], isPrivate:false },
  { id:"comfort", title:"Comfort Media", description:"For quiet weekends and long train rides.", owner:users[2], mediaIds:["the-bear","tomorrow","past-lives"], isPrivate:false },
];
