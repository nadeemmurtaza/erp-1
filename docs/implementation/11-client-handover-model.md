# 11 - Client Distribution & Master Platform Model

## 1. The Business Goals

The architecture of this platform must simultaneously support two distinct business objectives:

1. **The Master Platform (Internal Business):** Maintain a single, unified "super-platform" containing every sector (Apparel, Pharmacy, Books, etc.) and every business model (B2B, B2C, C2C). This serves as the flagship e-commerce engine for internal operations, running all capabilities simultaneously.
2. **Client Need-Based Handover (Agency/SaaS Model):** Deliver highly customized, private source-code repositories to external clients. A client must receive *only* the source code for the specific modules they purchased. Proprietary workflows, upcoming features, or modules belonging to other sectors must be physically absent from their delivered codebase.

---

## 2. The Rejected Approaches

When attempting to satisfy both a Master Platform and customized client handovers, the following approaches were evaluated and **rejected**:

* **Feature Branching for Clients:** Maintaining a `main-client1` branch and a `main-client2` branch. **Rejected** because fixing a universal bug (e.g., in checkout) requires manual cherry-picking across dozens of branches, leading to unmaintainable "merge hell."
* **Git Submodules:** Splitting sectors into separate Git repositories and linking them together. **Rejected** because managing dependencies and Prisma schemas across physical repository boundaries drastically slows down development speed.
* **NPM Packages:** Publishing the core engine to a private NPM registry. **Rejected** because Prisma does not easily support runtime schema merging across NPM packages.

---

## 3. The Solution: The "Blueprint & Extractor" Model

To achieve both goals without compromising developer velocity, the platform uses the **Blueprint & Extractor Model**. 

Development logic is decoupled from client delivery logic.

### Phase A: The Blueprint (Single Monorepo)
All developers work out of one single Git repository: the Blueprint. 
* **Zero Merge Hell:** Bug fixes and new features are merged into one `main` branch. 
* **The Master Platform Deployment:** To run the internal Master Platform, the Blueprint is deployed in its entirety, and the `.env` file is configured to boot every sector:
  ```bash
  MODULES=catalog,cart,orders,payments,apparel,pharmacy,books,stitching,bom,b2b_pricing
  ```

### Phase B: Branch Organization
To keep the massive Blueprint repository organized, developers strictly group branches by sector, module, and capability.
* **Format:** `<pack>/<type>/<module>/[capability]-<slug>`
* **Examples:**
  * `core/feat/cart/b2b-wholesale-tiers`
  * `books/feat/publishing/author-royalties`
  * `apparel/fix/stitching/queue-validation`

### Phase C: Client Extraction (Need-Based Shipping)
When a contract requires source code delivery to Client 2 (who only sells books), they are **never given access to the Blueprint repository**. 

Instead, an automated **Client Extractor Script** is executed against the Blueprint:
```bash
npm run export-client --name="Client 2" --modules=core,catalog,cart,orders,books
```

**The Extractor Script performs the following:**
1. Copies the universal `core` platform into a brand new directory.
2. Copies only the requested sector packs (e.g., `books`).
3. Physically deletes all unrequested packs (e.g., `apparel`, `pharmacy`).
4. Compiles a clean, minimized `schema.prisma` file containing only the relevant tables.
5. Initializes a fresh Git repository.

### Summary
The client receives a pristine, perfectly tailored repository. Your business protects its intellectual property and proprietary sector code. Your developers work at maximum speed in a single codebase, fixing bugs once and distributing them everywhere.
