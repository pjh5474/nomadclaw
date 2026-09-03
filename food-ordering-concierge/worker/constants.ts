export const CARD_NUMBER_PATTERN =
	/\b(?:(?:\d{4}[-\s]?){3}\d{4}|\d{4}[-\s]?\d{6}[-\s]?\d{5}|\d{13,19})\b/g;

export type MenuCategory = "pizza" | "side" | "drink" | "dessert";

/** 장바구니 SKU. 사이즈마다 별도 항목. addToCart는 `id`로 담습니다. */
export type MenuItem = {
	id: string;
	name: string;
	aliases: string[];
	category: MenuCategory;
	price: number;
	description?: string;
};

/** getLocation 좌표와 비교해 가장 가까운 매장을 고를 때 사용 */
export type Store = {
	id: string;
	name: string;
	address: string;
	lat: number;
	lng: number;
};

export const STORES: Store[] = [
	{
		id: "gangnam",
		name: "강남역점",
		address: "서울 강남구 강남대로 396",
		lat: 37.497_175,
		lng: 127.027_926,
	},
	{
		id: "hongdae",
		name: "홍대입구점",
		address: "서울 마포구 양화로 161",
		lat: 37.556_334,
		lng: 126.923_683,
	},
	{
		id: "jamsil",
		name: "잠실점",
		address: "서울 송파구 올림픽로 240",
		lat: 37.513_308,
		lng: 127.100_163,
	},
];

export const MENU: MenuItem[] = [
	// ── Pizza ──────────────────────────────────────────
	{
		id: "pepperoni-sm",
		name: "스몰 페퍼로니",
		aliases: ["Small Pepperoni", "pepperoni small", "스몰페퍼로니"],
		category: "pizza",
		price: 12_000,
		description: "클래식 페퍼로니, 25cm",
	},
	{
		id: "pepperoni-md",
		name: "미디엄 페퍼로니",
		aliases: ["Medium Pepperoni", "pepperoni medium", "미디엄페퍼로니"],
		category: "pizza",
		price: 15_000,
		description: "클래식 페퍼로니, 30cm",
	},
	{
		id: "pepperoni-lg",
		name: "라지 페퍼로니",
		aliases: ["Large Pepperoni", "pepperoni large", "라지페퍼로니"],
		category: "pizza",
		price: 18_000,
		description: "클래식 페퍼로니, 35cm",
	},
	{
		id: "cheese-sm",
		name: "스몰 치즈",
		aliases: ["Small Cheese", "cheese pizza small"],
		category: "pizza",
		price: 10_000,
	},
	{
		id: "cheese-md",
		name: "미디엄 치즈",
		aliases: ["Medium Cheese", "cheese pizza medium"],
		category: "pizza",
		price: 13_000,
	},
	{
		id: "cheese-lg",
		name: "라지 치즈",
		aliases: ["Large Cheese", "cheese pizza large"],
		category: "pizza",
		price: 16_000,
	},
	{
		id: "veggie-lg",
		name: "라지 야채",
		aliases: ["Large Veggie", "veggie pizza large", "야채 피자"],
		category: "pizza",
		price: 17_000,
	},
	// ── Sides ──────────────────────────────────────────
	{
		id: "garlic-bread",
		name: "갈릭 빵",
		aliases: ["Garlic Bread", "garlic bread"],
		category: "side",
		price: 4_500,
	},
	{
		id: "wings-8",
		name: "윙 8조각",
		aliases: ["8pc Wings", "chicken wings"],
		category: "side",
		price: 9_000,
	},
	{
		id: "fries",
		name: "감자튀김",
		aliases: ["French Fries", "fries"],
		category: "side",
		price: 3_500,
	},
	// ── Drinks ─────────────────────────────────────────
	{
		id: "coke",
		name: "콜라",
		aliases: ["Coke", "Coca-Cola", "cola"],
		category: "drink",
		price: 2_000,
	},
	{
		id: "sprite",
		name: "사이다",
		aliases: ["Sprite", "soda"],
		category: "drink",
		price: 2_000,
	},
];

/** getMenu 도구가 모델에 넘길 카탈로그 (모델이 id를 고르는 데 사용) */
export function getMenuCatalog() {
	return MENU.map(({ id, name, aliases, category, price, description }) => ({
		id,
		name,
		aliases,
		category,
		price,
		currency: "KRW" as const,
		description,
	}));
}

export function getMenuItemById(id: string): MenuItem | undefined {
	return MENU.find((item) => item.id === id);
}
