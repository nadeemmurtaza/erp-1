--
-- PostgreSQL database dump
--

\restrict Aml4O1evHcCQXqJCem7OFOC9BfgtaFLoMPIOlj8HOvbmyaRPIpYJnnSBPoZKWom

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ContactStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ContactStatus" AS ENUM (
    'LEAD',
    'ACTIVE',
    'REPEAT',
    'DORMANT',
    'BLOCKED'
);


ALTER TYPE public."ContactStatus" OWNER TO postgres;

--
-- Name: DevicePlatform; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."DevicePlatform" AS ENUM (
    'IOS',
    'ANDROID',
    'WEB'
);


ALTER TYPE public."DevicePlatform" OWNER TO postgres;

--
-- Name: InteractionKind; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."InteractionKind" AS ENUM (
    'CALL',
    'WHATSAPP',
    'EMAIL',
    'SMS',
    'VISIT',
    'NOTE',
    'COMPLAINT'
);


ALTER TYPE public."InteractionKind" OWNER TO postgres;

--
-- Name: LeadStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."LeadStatus" AS ENUM (
    'NEW',
    'CONTACTED',
    'QUOTED',
    'WON',
    'LOST'
);


ALTER TYPE public."LeadStatus" OWNER TO postgres;

--
-- Name: MeasurementUnit; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."MeasurementUnit" AS ENUM (
    'INCH',
    'CM'
);


ALTER TYPE public."MeasurementUnit" OWNER TO postgres;

--
-- Name: OrderStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."OrderStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'PROCESSING',
    'READY_TO_SHIP',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'RETURNED'
);


ALTER TYPE public."OrderStatus" OWNER TO postgres;

--
-- Name: OutboxStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."OutboxStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'DONE',
    'FAILED'
);


ALTER TYPE public."OutboxStatus" OWNER TO postgres;

--
-- Name: PaymentStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PaymentStatus" AS ENUM (
    'PENDING',
    'AWAITING_APPROVAL',
    'PAID',
    'FAILED',
    'REFUNDED',
    'CANCELLED'
);


ALTER TYPE public."PaymentStatus" OWNER TO postgres;

--
-- Name: PermissionEffect; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PermissionEffect" AS ENUM (
    'GRANT',
    'REVOKE'
);


ALTER TYPE public."PermissionEffect" OWNER TO postgres;

--
-- Name: ProductKind; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ProductKind" AS ENUM (
    'STITCHED',
    'UNSTITCHED',
    'STITCHING_SERVICE'
);


ALTER TYPE public."ProductKind" OWNER TO postgres;

--
-- Name: ProductStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ProductStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'ARCHIVED'
);


ALTER TYPE public."ProductStatus" OWNER TO postgres;

--
-- Name: PurchaseOrderStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PurchaseOrderStatus" AS ENUM (
    'DRAFT',
    'SENT',
    'PARTIAL',
    'RECEIVED',
    'CANCELLED'
);


ALTER TYPE public."PurchaseOrderStatus" OWNER TO postgres;

--
-- Name: ShipmentStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ShipmentStatus" AS ENUM (
    'PENDING',
    'DISPATCHED',
    'IN_TRANSIT',
    'DELIVERED',
    'RETURNED',
    'LOST'
);


ALTER TYPE public."ShipmentStatus" OWNER TO postgres;

--
-- Name: StitchingOrderStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."StitchingOrderStatus" AS ENUM (
    'DRAFT',
    'AWAITING_FABRIC',
    'FABRIC_RECEIVED',
    'IN_PRODUCTION',
    'READY',
    'COMPLETED',
    'CANCELLED'
);


ALTER TYPE public."StitchingOrderStatus" OWNER TO postgres;

--
-- Name: StitchingSelectionType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."StitchingSelectionType" AS ENUM (
    'SINGLE',
    'MULTI'
);


ALTER TYPE public."StitchingSelectionType" OWNER TO postgres;

--
-- Name: StitchingStage; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."StitchingStage" AS ENUM (
    'RECEIVED',
    'CUTTING',
    'STITCHING',
    'QC',
    'READY',
    'DISPATCHED'
);


ALTER TYPE public."StitchingStage" OWNER TO postgres;

--
-- Name: StockCountStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."StockCountStatus" AS ENUM (
    'DRAFT',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);


ALTER TYPE public."StockCountStatus" OWNER TO postgres;

--
-- Name: StockMovementReason; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."StockMovementReason" AS ENUM (
    'PURCHASE_RECEIPT',
    'SALE',
    'CANCELLATION',
    'RETURN',
    'ADJUSTMENT',
    'DAMAGE',
    'COUNT',
    'WRITE_OFF'
);


ALTER TYPE public."StockMovementReason" OWNER TO postgres;

--
-- Name: SupplierBillStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."SupplierBillStatus" AS ENUM (
    'UNPAID',
    'PARTIAL',
    'PAID'
);


ALTER TYPE public."SupplierBillStatus" OWNER TO postgres;

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."UserRole" AS ENUM (
    'CUSTOMER',
    'STAFF',
    'TAILOR',
    'ADMIN'
);


ALTER TYPE public."UserRole" OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Address; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Address" (
    id text NOT NULL,
    "userId" text,
    label text,
    "fullName" text NOT NULL,
    phone text NOT NULL,
    line1 text NOT NULL,
    line2 text,
    city text NOT NULL,
    province text NOT NULL,
    "postalCode" text,
    country text DEFAULT 'PK'::text NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Address" OWNER TO postgres;

--
-- Name: AnalyticsEvent; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AnalyticsEvent" (
    id text NOT NULL,
    type text NOT NULL,
    path text,
    source text DEFAULT 'direct'::text NOT NULL,
    "sessionId" text NOT NULL,
    meta jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AnalyticsEvent" OWNER TO postgres;

--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "actorId" text,
    action text NOT NULL,
    entity text NOT NULL,
    "entityId" text,
    data jsonb,
    ip text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AuditLog" OWNER TO postgres;

--
-- Name: Cart; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Cart" (
    id text NOT NULL,
    token text NOT NULL,
    "userId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Cart" OWNER TO postgres;

--
-- Name: CartItem; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."CartItem" (
    id text NOT NULL,
    "cartId" text NOT NULL,
    "productId" text NOT NULL,
    "variantId" text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    "stitchingServiceId" text,
    "measurementProfileId" text,
    "stitchingNotes" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "measurementValues" jsonb,
    "customDesignText" jsonb,
    "garmentTypeId" text,
    "sizeToken" text
);


ALTER TABLE public."CartItem" OWNER TO postgres;

--
-- Name: CartItemStitchingOption; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."CartItemStitchingOption" (
    "cartItemId" text NOT NULL,
    "optionId" text NOT NULL
);


ALTER TABLE public."CartItemStitchingOption" OWNER TO postgres;

--
-- Name: Category; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Category" (
    id text NOT NULL,
    slug text NOT NULL,
    "parentId" text,
    "imageUrl" text,
    "order" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Category" OWNER TO postgres;

--
-- Name: CategoryTranslation; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."CategoryTranslation" (
    id text NOT NULL,
    "categoryId" text NOT NULL,
    locale text NOT NULL,
    name text NOT NULL,
    description text
);


ALTER TABLE public."CategoryTranslation" OWNER TO postgres;

--
-- Name: Contact; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Contact" (
    id text NOT NULL,
    "phoneE164" text,
    email text,
    name text NOT NULL,
    city text,
    source text DEFAULT 'storefront'::text NOT NULL,
    status public."ContactStatus" DEFAULT 'LEAD'::public."ContactStatus" NOT NULL,
    "ownerId" text,
    "userId" text,
    notes text,
    "orderCount" integer DEFAULT 0 NOT NULL,
    "lifetimeValue" integer DEFAULT 0 NOT NULL,
    "avgOrderValue" integer DEFAULT 0 NOT NULL,
    "lastOrderAt" timestamp(3) without time zone,
    "firstOrderAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Contact" OWNER TO postgres;

--
-- Name: ContactTag; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ContactTag" (
    "contactId" text NOT NULL,
    "tagId" text NOT NULL
);


ALTER TABLE public."ContactTag" OWNER TO postgres;

--
-- Name: DeviceToken; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."DeviceToken" (
    id text NOT NULL,
    "userId" text NOT NULL,
    token text NOT NULL,
    platform public."DevicePlatform" DEFAULT 'ANDROID'::public."DevicePlatform" NOT NULL,
    "appVersion" text,
    locale text,
    "lastSeenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."DeviceToken" OWNER TO postgres;

--
-- Name: FollowUpTask; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."FollowUpTask" (
    id text NOT NULL,
    "contactId" text,
    "leadId" text,
    "assigneeId" text,
    note text NOT NULL,
    "dueAt" timestamp(3) without time zone NOT NULL,
    "isDone" boolean DEFAULT false NOT NULL,
    "doneAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."FollowUpTask" OWNER TO postgres;

--
-- Name: GarmentSizeChart; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."GarmentSizeChart" (
    id text NOT NULL,
    "garmentTypeId" text NOT NULL,
    "sizeToken" text NOT NULL,
    "values" jsonb NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."GarmentSizeChart" OWNER TO postgres;

--
-- Name: GarmentType; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."GarmentType" (
    id text NOT NULL,
    key text NOT NULL,
    "labelEn" text NOT NULL,
    "labelUr" text NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "stitchingPrice" integer DEFAULT 0 NOT NULL,
    "stitchingEnabled" boolean DEFAULT true NOT NULL,
    "baseFabricGaz" double precision,
    "aliasesEn" text[] DEFAULT ARRAY[]::text[],
    "aliasesUr" text[] DEFAULT ARRAY[]::text[]
);


ALTER TABLE public."GarmentType" OWNER TO postgres;

--
-- Name: GoodsReceipt; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."GoodsReceipt" (
    id text NOT NULL,
    number text NOT NULL,
    "purchaseOrderId" text NOT NULL,
    "receivedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "receivedById" text,
    notes text,
    "freightCost" integer DEFAULT 0 NOT NULL,
    "dutyCost" integer DEFAULT 0 NOT NULL,
    "otherCost" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."GoodsReceipt" OWNER TO postgres;

--
-- Name: GoodsReceiptItem; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."GoodsReceiptItem" (
    id text NOT NULL,
    "goodsReceiptId" text NOT NULL,
    "purchaseOrderItemId" text NOT NULL,
    "variantId" text NOT NULL,
    quantity integer NOT NULL,
    "unitCost" integer NOT NULL,
    "landedUnitCost" integer NOT NULL
);


ALTER TABLE public."GoodsReceiptItem" OWNER TO postgres;

--
-- Name: Interaction; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Interaction" (
    id text NOT NULL,
    "contactId" text,
    "leadId" text,
    kind public."InteractionKind" NOT NULL,
    body text NOT NULL,
    "actorId" text,
    "occurredAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Interaction" OWNER TO postgres;

--
-- Name: Lead; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Lead" (
    id text NOT NULL,
    "contactId" text,
    name text NOT NULL,
    phone text,
    email text,
    message text,
    source text DEFAULT 'contact_form'::text NOT NULL,
    status public."LeadStatus" DEFAULT 'NEW'::public."LeadStatus" NOT NULL,
    "ownerId" text,
    "quotedValue" integer,
    "lostReason" text,
    "convertedOrderId" text,
    "convertedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Lead" OWNER TO postgres;

--
-- Name: MeasurementField; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."MeasurementField" (
    id text NOT NULL,
    "garmentTypeId" text NOT NULL,
    key text NOT NULL,
    "labelEn" text NOT NULL,
    "labelUr" text NOT NULL,
    unit public."MeasurementUnit" DEFAULT 'INCH'::public."MeasurementUnit" NOT NULL,
    min double precision NOT NULL,
    max double precision NOT NULL,
    required boolean DEFAULT true NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    "helpEn" text,
    "helpUr" text,
    "isActive" boolean DEFAULT true NOT NULL
);


ALTER TABLE public."MeasurementField" OWNER TO postgres;

--
-- Name: MeasurementProfile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."MeasurementProfile" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "garmentTypeId" text NOT NULL,
    label text NOT NULL,
    "values" jsonb NOT NULL,
    notes text,
    "isDefault" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."MeasurementProfile" OWNER TO postgres;

--
-- Name: Order; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Order" (
    id text NOT NULL,
    number text NOT NULL,
    "userId" text,
    "contactId" text,
    status public."OrderStatus" DEFAULT 'PENDING'::public."OrderStatus" NOT NULL,
    currency text DEFAULT 'PKR'::text NOT NULL,
    "guestName" text,
    "guestEmail" text,
    "guestPhone" text,
    "shippingAddress" jsonb NOT NULL,
    "billingAddress" jsonb,
    "itemsSubtotal" integer NOT NULL,
    "stitchingSubtotal" integer DEFAULT 0 NOT NULL,
    "itemDiscountTotal" integer DEFAULT 0 NOT NULL,
    "orderDiscount" integer DEFAULT 0 NOT NULL,
    "shippingFee" integer DEFAULT 0 NOT NULL,
    "codFee" integer DEFAULT 0 NOT NULL,
    "grandTotal" integer NOT NULL,
    "shippingZone" text,
    "customerNote" text,
    "staffNote" text,
    "cancelReason" text,
    "placedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "confirmedAt" timestamp(3) without time zone,
    "deliveredAt" timestamp(3) without time zone,
    "cancelledAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Order" OWNER TO postgres;

--
-- Name: OrderItem; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."OrderItem" (
    id text NOT NULL,
    "orderId" text NOT NULL,
    "productId" text,
    "variantId" text,
    kind public."ProductKind" NOT NULL,
    "nameEn" text NOT NULL,
    "nameUr" text,
    sku text,
    "imageUrl" text,
    "variantLabel" text,
    "unitPrice" integer NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    "stitchingFeeUnit" integer DEFAULT 0 NOT NULL,
    "discountUnit" integer DEFAULT 0 NOT NULL,
    "lineTotal" integer NOT NULL,
    "stitchingServiceId" text,
    "stitchingServiceName" text,
    "garmentTypeKey" text,
    "measurementSnapshot" jsonb,
    "optionsSnapshot" jsonb,
    "stitchingNotes" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "measurementValues" jsonb,
    "customDesignText" jsonb,
    "sizeToken" text,
    "unitCost" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."OrderItem" OWNER TO postgres;

--
-- Name: OrderStatusEvent; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."OrderStatusEvent" (
    id text NOT NULL,
    "orderId" text NOT NULL,
    "fromStatus" public."OrderStatus",
    "toStatus" public."OrderStatus" NOT NULL,
    note text,
    "actorId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."OrderStatusEvent" OWNER TO postgres;

--
-- Name: OutboxEvent; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."OutboxEvent" (
    id text NOT NULL,
    name text NOT NULL,
    payload jsonb NOT NULL,
    status public."OutboxStatus" DEFAULT 'PENDING'::public."OutboxStatus" NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "lastError" text,
    "availableAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "processedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."OutboxEvent" OWNER TO postgres;

--
-- Name: Payment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Payment" (
    id text NOT NULL,
    "orderId" text NOT NULL,
    provider text NOT NULL,
    status public."PaymentStatus" DEFAULT 'PENDING'::public."PaymentStatus" NOT NULL,
    amount integer NOT NULL,
    currency text DEFAULT 'PKR'::text NOT NULL,
    reference text,
    "providerRef" text,
    meta jsonb,
    "receiptUrl" text,
    "failureReason" text,
    "approvedById" text,
    "paidAt" timestamp(3) without time zone,
    "refundedAt" timestamp(3) without time zone,
    "refundAmount" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Payment" OWNER TO postgres;

--
-- Name: Permission; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Permission" (
    id text NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    category text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Permission" OWNER TO postgres;

--
-- Name: Product; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Product" (
    id text NOT NULL,
    slug text NOT NULL,
    kind public."ProductKind" NOT NULL,
    status public."ProductStatus" DEFAULT 'DRAFT'::public."ProductStatus" NOT NULL,
    "categoryId" text,
    "basePrice" integer NOT NULL,
    "compareAtPrice" integer,
    brand text,
    fabric text,
    season text,
    tags text[] DEFAULT ARRAY[]::text[],
    "pieceCount" integer,
    "fabricMeters" double precision,
    "stitchingAvailable" boolean DEFAULT false NOT NULL,
    "garmentTypeId" text,
    "featuredRank" integer DEFAULT 0 NOT NULL,
    "publishedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Product" OWNER TO postgres;

--
-- Name: ProductGarmentType; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ProductGarmentType" (
    "productId" text NOT NULL,
    "garmentTypeId" text NOT NULL
);


ALTER TABLE public."ProductGarmentType" OWNER TO postgres;

--
-- Name: ProductImage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ProductImage" (
    id text NOT NULL,
    "productId" text NOT NULL,
    "variantId" text,
    url text NOT NULL,
    alt text,
    "order" integer DEFAULT 0 NOT NULL,
    "isPrimary" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ProductImage" OWNER TO postgres;

--
-- Name: ProductTranslation; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ProductTranslation" (
    id text NOT NULL,
    "productId" text NOT NULL,
    locale text NOT NULL,
    name text NOT NULL,
    description text,
    "careInstructions" text,
    "metaTitle" text,
    "metaDescription" text
);


ALTER TABLE public."ProductTranslation" OWNER TO postgres;

--
-- Name: ProductVariant; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ProductVariant" (
    id text NOT NULL,
    "productId" text NOT NULL,
    sku text NOT NULL,
    size text,
    color text,
    "colorHex" text,
    "priceOverride" integer,
    stock integer DEFAULT 0 NOT NULL,
    "lowStockThreshold" integer DEFAULT 3 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    barcode text,
    "costPrice" integer DEFAULT 0 NOT NULL,
    "lastReceivedAt" timestamp(3) without time zone,
    "preferredSupplierId" text,
    "reorderPoint" integer,
    "reorderQuantity" integer
);


ALTER TABLE public."ProductVariant" OWNER TO postgres;

--
-- Name: PurchaseOrder; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PurchaseOrder" (
    id text NOT NULL,
    number text NOT NULL,
    "supplierId" text NOT NULL,
    status public."PurchaseOrderStatus" DEFAULT 'DRAFT'::public."PurchaseOrderStatus" NOT NULL,
    currency text DEFAULT 'PKR'::text NOT NULL,
    subtotal integer DEFAULT 0 NOT NULL,
    "freightCost" integer DEFAULT 0 NOT NULL,
    "dutyCost" integer DEFAULT 0 NOT NULL,
    "otherCost" integer DEFAULT 0 NOT NULL,
    total integer DEFAULT 0 NOT NULL,
    "expectedAt" timestamp(3) without time zone,
    "sentAt" timestamp(3) without time zone,
    "receivedAt" timestamp(3) without time zone,
    "cancelledAt" timestamp(3) without time zone,
    notes text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."PurchaseOrder" OWNER TO postgres;

--
-- Name: PurchaseOrderItem; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PurchaseOrderItem" (
    id text NOT NULL,
    "purchaseOrderId" text NOT NULL,
    "variantId" text NOT NULL,
    "quantityOrdered" integer NOT NULL,
    "quantityReceived" integer DEFAULT 0 NOT NULL,
    "unitCost" integer NOT NULL,
    "lineTotal" integer NOT NULL,
    note text
);


ALTER TABLE public."PurchaseOrderItem" OWNER TO postgres;

--
-- Name: RefreshToken; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."RefreshToken" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "userAgent" text,
    ip text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."RefreshToken" OWNER TO postgres;

--
-- Name: RolePermission; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."RolePermission" (
    id text NOT NULL,
    role public."UserRole" NOT NULL,
    "permissionId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."RolePermission" OWNER TO postgres;

--
-- Name: Segment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Segment" (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    filter jsonb NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Segment" OWNER TO postgres;

--
-- Name: Setting; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Setting" (
    key text NOT NULL,
    value jsonb NOT NULL,
    description text,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Setting" OWNER TO postgres;

--
-- Name: Shipment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Shipment" (
    id text NOT NULL,
    "orderId" text NOT NULL,
    courier text DEFAULT 'manual'::text NOT NULL,
    "trackingNumber" text,
    "trackingUrl" text,
    status public."ShipmentStatus" DEFAULT 'PENDING'::public."ShipmentStatus" NOT NULL,
    cost integer,
    "dispatchedAt" timestamp(3) without time zone,
    "deliveredAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Shipment" OWNER TO postgres;

--
-- Name: StitchingJob; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."StitchingJob" (
    id text NOT NULL,
    number text NOT NULL,
    "orderItemId" text,
    "stitchingOrderId" text,
    "garmentTypeId" text NOT NULL,
    "measurementSnapshot" jsonb NOT NULL,
    "optionsSnapshot" jsonb,
    instructions text,
    stage public."StitchingStage" DEFAULT 'RECEIVED'::public."StitchingStage" NOT NULL,
    "assignedTailorId" text,
    priority integer DEFAULT 0 NOT NULL,
    "dueAt" timestamp(3) without time zone,
    "startedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."StitchingJob" OWNER TO postgres;

--
-- Name: StitchingJobEvent; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."StitchingJobEvent" (
    id text NOT NULL,
    "jobId" text NOT NULL,
    "fromStage" public."StitchingStage",
    "toStage" public."StitchingStage" NOT NULL,
    note text,
    "photoUrl" text,
    "actorId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."StitchingJobEvent" OWNER TO postgres;

--
-- Name: StitchingOption; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."StitchingOption" (
    id text NOT NULL,
    "groupId" text NOT NULL,
    key text NOT NULL,
    "labelEn" text NOT NULL,
    "labelUr" text NOT NULL,
    "priceDelta" integer DEFAULT 0 NOT NULL,
    "imageUrl" text,
    "order" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);


ALTER TABLE public."StitchingOption" OWNER TO postgres;

--
-- Name: StitchingOptionGroup; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."StitchingOptionGroup" (
    id text NOT NULL,
    key text NOT NULL,
    "labelEn" text NOT NULL,
    "labelUr" text NOT NULL,
    "garmentTypeId" text,
    "selectionType" public."StitchingSelectionType" DEFAULT 'SINGLE'::public."StitchingSelectionType" NOT NULL,
    required boolean DEFAULT false NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    area text,
    "allowCustomText" boolean DEFAULT false NOT NULL,
    "helpEn" text,
    "helpUr" text
);


ALTER TABLE public."StitchingOptionGroup" OWNER TO postgres;

--
-- Name: StitchingOrder; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."StitchingOrder" (
    id text NOT NULL,
    number text NOT NULL,
    "userId" text,
    "contactId" text,
    status public."StitchingOrderStatus" DEFAULT 'DRAFT'::public."StitchingOrderStatus" NOT NULL,
    "guestName" text,
    "guestPhone" text,
    "guestEmail" text,
    "pickupAddress" jsonb,
    "deliveryAddress" jsonb,
    "fabricNotes" text,
    "staffNotes" text,
    "quotedFee" integer,
    "fabricReceivedAt" timestamp(3) without time zone,
    "promisedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."StitchingOrder" OWNER TO postgres;

--
-- Name: StockAdjustment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."StockAdjustment" (
    id text NOT NULL,
    "variantId" text NOT NULL,
    delta integer NOT NULL,
    "resultingStock" integer NOT NULL,
    reason text NOT NULL,
    note text,
    "actorId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."StockAdjustment" OWNER TO postgres;

--
-- Name: StockCount; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."StockCount" (
    id text NOT NULL,
    "countNumber" text NOT NULL,
    status public."StockCountStatus" DEFAULT 'DRAFT'::public."StockCountStatus" NOT NULL,
    note text,
    "startedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "cancelledAt" timestamp(3) without time zone,
    "createdBy" text,
    "assignedTo" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."StockCount" OWNER TO postgres;

--
-- Name: StockCountLine; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."StockCountLine" (
    id text NOT NULL,
    "stockCountId" text NOT NULL,
    "variantId" text NOT NULL,
    expected integer,
    counted integer,
    note text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."StockCountLine" OWNER TO postgres;

--
-- Name: StockMovement; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."StockMovement" (
    id text NOT NULL,
    "variantId" text NOT NULL,
    delta integer NOT NULL,
    "resultingStock" integer NOT NULL,
    reason public."StockMovementReason" NOT NULL,
    "refType" text,
    "refId" text,
    "unitCost" integer,
    note text,
    "actorId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."StockMovement" OWNER TO postgres;

--
-- Name: Supplier; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Supplier" (
    id text NOT NULL,
    name text NOT NULL,
    "contactName" text,
    phone text,
    email text,
    address text,
    city text,
    "paymentTerms" text,
    "leadTimeDays" integer DEFAULT 7 NOT NULL,
    notes text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Supplier" OWNER TO postgres;

--
-- Name: SupplierBill; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SupplierBill" (
    id text NOT NULL,
    "supplierId" text NOT NULL,
    "purchaseOrderId" text,
    reference text,
    amount integer NOT NULL,
    "amountPaid" integer DEFAULT 0 NOT NULL,
    status public."SupplierBillStatus" DEFAULT 'UNPAID'::public."SupplierBillStatus" NOT NULL,
    "issuedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dueAt" timestamp(3) without time zone,
    "paidAt" timestamp(3) without time zone,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."SupplierBill" OWNER TO postgres;

--
-- Name: SupplierProduct; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SupplierProduct" (
    id text NOT NULL,
    "supplierId" text NOT NULL,
    "variantId" text NOT NULL,
    "supplierSku" text,
    "lastCost" integer DEFAULT 0 NOT NULL,
    moq integer DEFAULT 1 NOT NULL,
    "leadTimeDays" integer,
    "isPreferred" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."SupplierProduct" OWNER TO postgres;

--
-- Name: Tag; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Tag" (
    id text NOT NULL,
    name text NOT NULL,
    color text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Tag" OWNER TO postgres;

--
-- Name: TailorProfile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."TailorProfile" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "displayName" text NOT NULL,
    phone text,
    specialties text[] DEFAULT ARRAY[]::text[],
    "capacityPerWeek" integer DEFAULT 20 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."TailorProfile" OWNER TO postgres;

--
-- Name: User; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text,
    phone text,
    "passwordHash" text,
    "firstName" text,
    "lastName" text,
    role public."UserRole" DEFAULT 'CUSTOMER'::public."UserRole" NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "lastLoginAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."User" OWNER TO postgres;

--
-- Name: UserPermission; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."UserPermission" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "permissionId" text NOT NULL,
    effect public."PermissionEffect" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."UserPermission" OWNER TO postgres;

--
-- Name: VariantSalesStat; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."VariantSalesStat" (
    "variantId" text NOT NULL,
    units30 integer DEFAULT 0 NOT NULL,
    units90 integer DEFAULT 0 NOT NULL,
    "lastSoldAt" timestamp(3) without time zone,
    "daysOfCover" double precision,
    "ageDays" integer,
    "computedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isDeadStock" boolean DEFAULT false NOT NULL,
    "isSlowMover" boolean DEFAULT false NOT NULL,
    "lastLowStockAlertAt" timestamp(3) without time zone
);


ALTER TABLE public."VariantSalesStat" OWNER TO postgres;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO postgres;

--
-- Data for Name: Address; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Address" (id, "userId", label, "fullName", phone, line1, line2, city, province, "postalCode", country, "isDefault", "createdAt", "updatedAt") FROM stdin;
cmsx5reir0006v3uwf5f5wkga	cmsx5rehl0005v3uwdwy4jud8	Home	Ayesha Khan	+923001234567	House 12, Street 5	DHA Phase 6	Karachi	Sindh	75500	PK	t	2026-08-17 11:36:15.94	2026-08-17 11:36:15.94
cmt1dpufx0006v3ioxhftdicu	cmsx5rehl0005v3uwdwy4jud8	Home	Ayesha Khan	+923001234567	House 12, Street 5	DHA Phase 6	Karachi	Sindh	75500	PK	t	2026-08-20 10:30:04.894	2026-08-20 10:30:04.894
cmt1y9t0c0006v3p4gvud939a	cmsx5rehl0005v3uwdwy4jud8	Home	Ayesha Khan	+923001234567	House 12, Street 5	DHA Phase 6	Karachi	Sindh	75500	PK	t	2026-08-20 20:05:28.477	2026-08-20 20:05:28.477
cmtdcvb5o003ev3gcnmius7yf	cmsx5rehl0005v3uwdwy4jud8	Home	Ayesha Khan	+923001234567	House 12, Street 5	DHA Phase 6	Karachi	Sindh	75500	PK	t	2026-08-28 19:39:34.332	2026-08-28 19:39:34.332
cmtdcvu12000uv3qoj5p9p47k	cmsx5rehl0005v3uwdwy4jud8	Home	Ayesha Khan	+923001234567	House 12, Street 5	DHA Phase 6	Karachi	Sindh	75500	PK	t	2026-08-28 19:39:58.79	2026-08-28 19:39:58.79
cmtdef5l0000uv3dss17ubun7	cmsx5rehl0005v3uwdwy4jud8	Home	Ayesha Khan	+923001234567	House 12, Street 5	DHA Phase 6	Karachi	Sindh	75500	PK	t	2026-08-28 20:22:59.844	2026-08-28 20:22:59.844
cmtdkgdw8000uv39wezr3j288	cmsx5rehl0005v3uwdwy4jud8	Home	Ayesha Khan	+923001234567	House 12, Street 5	DHA Phase 6	Karachi	Sindh	75500	PK	t	2026-08-28 23:11:54.969	2026-08-28 23:11:54.969
\.


--
-- Data for Name: AnalyticsEvent; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AnalyticsEvent" (id, type, path, source, "sessionId", meta, "createdAt") FROM stdin;
cmt723q9z0005v3z8nlpcrl2i	page_view	/en	direct	4f2d55b2-154f-4382-80e9-f61b58c50c2a	\N	2026-08-24 09:51:34.343
cmt7247010006v3z8tjhdqjeb	page_view	/en	direct	4f2d55b2-154f-4382-80e9-f61b58c50c2a	\N	2026-08-24 09:51:56.017
cmt724kp20007v3z82yhzy1gv	page_view	/en/shop	direct	4f2d55b2-154f-4382-80e9-f61b58c50c2a	\N	2026-08-24 09:52:13.767
cmt72519v0008v3z8kbqkd1c9	page_view	/en/checkout	direct	4f2d55b2-154f-4382-80e9-f61b58c50c2a	\N	2026-08-24 09:52:35.252
cmt7251a30009v3z8wp74eanw	checkout_started	\N	direct	4f2d55b2-154f-4382-80e9-f61b58c50c2a	\N	2026-08-24 09:52:35.259
cmt72545k000av3z8utsvzo1x	page_view	/en	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-24 09:52:38.984
cmt7310ll0000v364q2d2a9sq	page_view	/en	direct	4f2d55b2-154f-4382-80e9-f61b58c50c2a	\N	2026-08-24 10:17:27.369
cmt731wrx0001v364c2w78klw	page_view	/en/product/embroidered-lawn-3-piece-ferozi	direct	4f2d55b2-154f-4382-80e9-f61b58c50c2a	\N	2026-08-24 10:18:09.069
cmt732ph60004v364vl4nn13y	add_to_cart	\N	direct	4f2d55b2-154f-4382-80e9-f61b58c50c2a	{"quantity": 1, "variantId": "cmsx5rexv004iv3uwhtv4yelr"}	2026-08-24 10:18:46.266
cmt732vnl0005v3642npx0prq	page_view	/en/cart	direct	4f2d55b2-154f-4382-80e9-f61b58c50c2a	\N	2026-08-24 10:18:54.273
cmt7338k10006v364crbudtfv	page_view	/en/checkout	direct	4f2d55b2-154f-4382-80e9-f61b58c50c2a	\N	2026-08-24 10:19:10.993
cmt7338k80007v364ip8phl40	checkout_started	\N	direct	4f2d55b2-154f-4382-80e9-f61b58c50c2a	\N	2026-08-24 10:19:11
cmt7374cs000gv3644jnlw0r0	page_view	/en	direct	4f2d55b2-154f-4382-80e9-f61b58c50c2a	\N	2026-08-24 10:22:12.172
cmt73799a000hv3640fl1eir2	page_view	/en	direct	4f2d55b2-154f-4382-80e9-f61b58c50c2a	\N	2026-08-24 10:22:18.527
cmt739r16000kv364wy34iuwx	page_view	/en	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-24 10:24:14.875
cmt9xx01x0000v3io9w066sdy	page_view	/en	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-26 10:17:40.483
cmt9ywwb30001v3ioic54fk3g	page_view	/en/shop	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-26 10:45:35.245
cmt9z6m0p0000v3vw6oahor7o	page_view	/en/shop	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-26 10:53:08.473
cmt9z6m7o0001v3vw8yqv7u6f	page_view	/en/shop	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-26 10:53:08.48
cmt9z75jl0002v3vwz3vn8itw	page_view	/en/shop	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-26 10:53:33.777
cmt9zbx6g0000v3rsq6qkth4c	page_view	/en/shop	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-26 10:57:16.214
cmt9zvzrd0001v3rswtf48ges	page_view	/en	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-26 11:12:52.68
cmt9zwawg0002v3rst9lrstz4	page_view	/en/shop	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-26 11:13:07.121
cmt9zynqo0003v3rshu72509c	page_view	/en	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-26 11:14:57.072
cmtb0absu0000v3h014q8d3sy	page_view	/en/contact	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-27 04:11:47.643
cmtb0aqet0001v3h0qg03nbdc	page_view	/en/story	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-27 04:12:06.581
cmtde5hm00000v3sgbk9n9fl8	page_view	/en	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-28 20:15:28.867
cmtde7jd90001v3sg2emys802	page_view	/en/product/ready-chiffon-formal-maroon	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-28 20:17:04.459
cmtdek61b0000v3y8ev5gzptj	page_view	/en/product/ready-chiffon-formal-maroon	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-28 20:26:53.708
cmtdkjdw30000v36gfxjn0b20	page_view	/en	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-28 23:14:14.929
cmtdkjz4f0001v36gjtr3zdxf	page_view	/en/product/ready-chiffon-formal-maroon	direct	12113479-bdae-4481-b194-aaa98f862752	\N	2026-08-28 23:14:42.446
\.


--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AuditLog" (id, "actorId", action, entity, "entityId", data, ip, "createdAt") FROM stdin;
cmsxk1qrj000ev3z4phsi71dh	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmsxjvk0f000bv3ug56i6yywp	{"to": "CONFIRMED", "from": "PENDING"}	\N	2026-08-17 18:16:12.991
cmsxk1xdx000jv3z4jvqzlmp6	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmsxjvk0f000bv3ug56i6yywp	{"to": "PROCESSING", "from": "CONFIRMED"}	\N	2026-08-17 18:16:21.573
cmsxk20mp000ov3z45ci9dbun	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmsxjvk0f000bv3ug56i6yywp	{"to": "READY_TO_SHIP", "from": "PROCESSING"}	\N	2026-08-17 18:16:25.777
cmsxk26ko000tv3z41cl92cc3	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmsxjvk0f000bv3ug56i6yywp	{"to": "SHIPPED", "from": "READY_TO_SHIP"}	\N	2026-08-17 18:16:33.48
cmsxk29q1000yv3z4ydml56pc	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmsxjvk0f000bv3ug56i6yywp	{"to": "DELIVERED", "from": "SHIPPED"}	\N	2026-08-17 18:16:37.561
cmsxkmqp30008v33onyx0tdjs	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmsxkmqnw0003v33od952yk7m	{"kind": "UNSTITCHED", "slug": "hhhc"}	\N	2026-08-17 18:32:32.679
cmsxkna8v000cv33o0zn4hosz	cmsx5rcwn0000v3uwukkiufkd	product.image_added	Product	cmsxkmqnw0003v33od952yk7m	{"key": "products/2026/08/screenshot-20260806-223755-457330c9.png", "imageId": "cmsxkna8p000av33oc0b169xv"}	\N	2026-08-17 18:32:58.016
cmsxkni4q000iv33oh7jbdt2p	cmsx5rcwn0000v3uwukkiufkd	product.updated	Product	cmsxkmqnw0003v33od952yk7m	{"changed": ["kind", "status", "categoryId", "basePrice", "compareAtPrice", "fabric", "season", "tags", "featuredRank", "pieceCount", "fabricMeters", "stitchingAvailable", "garmentTypeIds", "translations", "variants"]}	\N	2026-08-17 18:33:08.234
cmt015g01000bv3g097lflzd9	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmt015fy90007v3g0mt2amifh	{"kind": "UNSTITCHED", "slug": "jhbuv"}	\N	2026-08-19 11:50:31.488
cmt3hte32004pv3moeldcc8w3	cmsx5rcwn0000v3uwukkiufkd	payment.approved	Payment	cmt3hte1b004kv3mobkgwkjtz	{"amount": 314900, "provider": "bank_transfer"}	\N	2026-08-21 22:00:21.135
cmt3hte8z005jv3moxf1ju43m	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmt3hte770058v3mo7r9i5w97	{"to": "CONFIRMED", "from": "PENDING"}	\N	2026-08-21 22:00:21.347
cmt3hte9w005ov3moi3yjezw5	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmt3hte770058v3mo7r9i5w97	{"to": "PROCESSING", "from": "CONFIRMED"}	\N	2026-08-21 22:00:21.38
cmt3hteaw005tv3mo5ip50gtd	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmt3hte770058v3mo7r9i5w97	{"to": "READY_TO_SHIP", "from": "PROCESSING"}	\N	2026-08-21 22:00:21.416
cmt3htebu005yv3mo47namifn	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmt3hte770058v3mo7r9i5w97	{"to": "SHIPPED", "from": "READY_TO_SHIP"}	\N	2026-08-21 22:00:21.451
cmt3htecu0063v3mowmbg4k8i	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmt3hte770058v3mo7r9i5w97	{"to": "DELIVERED", "from": "SHIPPED"}	\N	2026-08-21 22:00:21.486
cmt3hteh2006ov3motun19r0v	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmt3htef50069v3moyp51ny31	{"to": "CANCELLED", "from": "PENDING", "note": "Customer changed their mind"}	\N	2026-08-21 22:00:21.639
cmt3hu0pq000zv3wcnc312fge	cmsx5rcwn0000v3uwukkiufkd	stitching_job.assigned	StitchingJob	cmt3hu0fg000hv3wc73zigj1g	{"tailorId": "cmsx5rdyp0002v3uwz6wvwyci"}	\N	2026-08-21 22:00:50.463
cmt3hu0ry0014v3wcvmat4j0p	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmt3hu0fg000hv3wc73zigj1g	{"to": "CUTTING", "from": "RECEIVED"}	\N	2026-08-21 22:00:50.543
cmt3hu0sy0019v3wcirtzo7mn	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmt3hu0fg000hv3wc73zigj1g	{"to": "STITCHING", "from": "CUTTING"}	\N	2026-08-21 22:00:50.578
cmt3hu0tz001ev3wcwpne154v	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmt3hu0fg000hv3wc73zigj1g	{"to": "QC", "from": "STITCHING"}	\N	2026-08-21 22:00:50.615
cmt3hu0vj001jv3wcpjsl1735	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmt3hu0fg000hv3wc73zigj1g	{"to": "STITCHING", "from": "QC", "note": "Hem is uneven on the left"}	\N	2026-08-21 22:00:50.671
cmt3hu1e6001pv3wc06ghls0x	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmt3hu0fg000hv3wc73zigj1g	{"to": "QC", "from": "STITCHING"}	\N	2026-08-21 22:00:51.342
cmt3hu1f3001uv3wcm3so6w22	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmt3hu0fg000hv3wc73zigj1g	{"to": "READY", "from": "QC"}	\N	2026-08-21 22:00:51.375
cmt3hu1lg0027v3wcp6jecqbf	cmsx5rcwn0000v3uwukkiufkd	stitching_order.fabric_received	StitchingOrder	cmt3hu1ip001wv3wcr8omboge	{"number": "STO-2026-0001"}	\N	2026-08-21 22:00:51.604
cmt3hu5kl003gv3wc5iuxfz23	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmt3hu5hv0035v3wcwjbykevu	{"to": "CANCELLED", "from": "PENDING", "note": "Test cancellation"}	\N	2026-08-21 22:00:56.757
cmt3hu6c4003vv3wc5xd0oiih	cmsx5rcwn0000v3uwukkiufkd	lead.updated	Lead	cmt3hu6bo003tv3wcnothbrx1	{"status": "QUOTED", "quotedValue": 850000}	\N	2026-08-21 22:00:57.748
cmt3hud7v0052v3wcir1p47rl	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmt3hud78004xv3wc2wsbdwxp	{"kind": "UNSTITCHED", "slug": "e2e-test-lawn-suit"}	\N	2026-08-21 22:01:06.667
cmt3huda40057v3wc28zvgrrg	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmt3hud900054v3wch1dxihph	{"kind": "STITCHED", "slug": "e2e-draft-product"}	\N	2026-08-21 22:01:06.748
cmt3hudcd005cv3wc1e1v3nkr	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmt3hudc40059v3wck6m2u0pc	{"kind": "STITCHED", "slug": "e2e-archive-me"}	\N	2026-08-21 22:01:06.829
cmt3hudcu005ev3wcuaahpmuf	cmsx5rcwn0000v3uwukkiufkd	product.archived	Product	cmt3hudc40059v3wck6m2u0pc	{"slug": "e2e-archive-me"}	\N	2026-08-21 22:01:06.847
cmt3hurmn00cgv3wcd6e9qu4f	cmsx5rcwn0000v3uwukkiufkd	payment.approved	Payment	cmt3hurl400cbv3wc32z19l6d	{"amount": 314900, "provider": "bank_transfer"}	\N	2026-08-21 22:01:25.344
cmt3hurtf00dav3wcvuye691y	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmt3hurqb00czv3wcbk1e7myl	{"to": "CONFIRMED", "from": "PENDING"}	\N	2026-08-21 22:01:25.587
cmt3huruf00dfv3wczmavdgm3	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmt3hurqb00czv3wcbk1e7myl	{"to": "PROCESSING", "from": "CONFIRMED"}	\N	2026-08-21 22:01:25.624
cmt3hurvb00dkv3wcqfyct7hf	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmt3hurqb00czv3wcbk1e7myl	{"to": "READY_TO_SHIP", "from": "PROCESSING"}	\N	2026-08-21 22:01:25.655
cmt3hurw700dpv3wclijop12p	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmt3hurqb00czv3wcbk1e7myl	{"to": "SHIPPED", "from": "READY_TO_SHIP"}	\N	2026-08-21 22:01:25.687
cmt3hurx400duv3wcgq9993iv	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmt3hurqb00czv3wcbk1e7myl	{"to": "DELIVERED", "from": "SHIPPED"}	\N	2026-08-21 22:01:25.72
cmt3hus0o00ebv3wcn50cifh9	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmt3hurzf00e0v3wc2eyr53we	{"to": "CANCELLED", "from": "PENDING", "note": "Customer changed their mind"}	\N	2026-08-21 22:01:25.848
cmt3o0gct0008v3y4w3bilomx	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmt3o0gbr0005v3y4km03dvsy	{"kind": "UNSTITCHED", "slug": "test-2"}	\N	2026-08-22 00:53:48.366
cmt3o0ui4000cv3y4hhvih8ga	cmsx5rcwn0000v3uwukkiufkd	product.updated	Product	cmt3o0gbr0005v3y4km03dvsy	{"changed": ["kind", "status", "basePrice", "compareAtPrice", "fabric", "season", "tags", "featuredRank", "pieceCount", "fabricMeters", "stitchingAvailable", "garmentTypeIds", "translations", "variants"]}	\N	2026-08-22 00:54:06.7
cmt3o2ehd000gv3y4c1yblwac	cmsx5rcwn0000v3uwukkiufkd	product.image_added	Product	cmt3o0gbr0005v3y4km03dvsy	{"key": "products/2026/08/screenshot-20260806-223755-a41c13b5.png", "imageId": "cmt3o2eh7000ev3y4mx19nbdw"}	\N	2026-08-22 00:55:19.25
cmtdcvc3d00l4v3gcnemfxp8q	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -174, "reason": "ADJUSTMENT", "resultingStock": 25}	\N	2026-08-28 19:39:35.546
cmtdcvc6n00lwv3gcj1wqg6u1	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": 1, "reason": "PURCHASE_RECEIPT", "resultingStock": 12}	\N	2026-08-28 19:39:35.663
cmtdd5pvl000ev3xwmk4lpq7n	cmsx5rcwn0000v3uwukkiufkd	inventory.stock_adjusted	ProductVariant	cmtdd5ptn000av3xwr99idg59	{"delta": 5, "reason": "ADJUSTMENT", "resultingStock": 5}	\N	2026-08-28 19:47:39.97
cmtdd5pw6000gv3xw82roc27w	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmtdd5ptn0007v3xwdra3r4mr	{"slug": "e2e-test-lawn-suit"}	\N	2026-08-28 19:47:39.99
cmtdd5pzk000lv3xw1vyzbtih	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmtdd5pz0000iv3xweog4v5j3	{"slug": "e2e-draft-product"}	\N	2026-08-28 19:47:40.113
cmtdd5q52000qv3xwgrqsfza3	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmtdd5q4k000nv3xwav208di6	{"slug": "e2e-archive-me"}	\N	2026-08-28 19:47:40.31
cmtdd5q6c000sv3xwucsk6tsf	cmsx5rcwn0000v3uwukkiufkd	product.archived	Product	cmtdd5q4k000nv3xwav208di6	{"slug": "e2e-archive-me"}	\N	2026-08-28 19:47:40.356
cmtdd5wha001bv3xwd9wxl8ua	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 199}	\N	2026-08-28 19:47:48.526
cmtdd5ws7001vv3xw7obnum5j	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 11}	\N	2026-08-28 19:47:48.92
cmtdd5wwa0020v3xwwuwo8vz7	cmsx5rcwn0000v3uwukkiufkd	stitching_job.assigned	StitchingJob	cmtdd5wiy001gv3xwjihzzp0c	{"tailorId": "cmsx5rdyp0002v3uwz6wvwyci"}	\N	2026-08-28 19:47:49.067
cmtdd5wyo0025v3xwps400t1h	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtdd5wiy001gv3xwjihzzp0c	{"to": "CUTTING", "from": "RECEIVED"}	\N	2026-08-28 19:47:49.152
cmtdd5wzq002av3xwntht1nod	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtdd5wiy001gv3xwjihzzp0c	{"to": "STITCHING", "from": "CUTTING"}	\N	2026-08-28 19:47:49.19
cmtdd5x0y002fv3xwq9kru5w5	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtdd5wiy001gv3xwjihzzp0c	{"to": "QC", "from": "STITCHING"}	\N	2026-08-28 19:47:49.235
cmtdd5x2o002kv3xw6syoqlvd	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtdd5wiy001gv3xwjihzzp0c	{"to": "STITCHING", "from": "QC", "note": "Hem is uneven on the left"}	\N	2026-08-28 19:47:49.297
cmtdd5xmr002qv3xwtuy4ybtb	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtdd5wiy001gv3xwjihzzp0c	{"to": "QC", "from": "STITCHING"}	\N	2026-08-28 19:47:50.019
cmtdd5xo1002vv3xwe46l72nl	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtdd5wiy001gv3xwjihzzp0c	{"to": "READY", "from": "QC"}	\N	2026-08-28 19:47:50.065
cmtdd5xus0038v3xw0ypg6a08	cmsx5rcwn0000v3uwukkiufkd	stitching_order.fabric_received	StitchingOrder	cmtdd5xre002xv3xw37ajvx3u	{"number": "STO-2026-0001"}	\N	2026-08-28 19:47:50.308
cmtdd61o3003nv3xw37jbuxqt	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -2, "reason": "SALE", "resultingStock": 498}	\N	2026-08-28 19:47:55.252
cmtdd61r40043v3xw9psdt2sr	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 497}	\N	2026-08-28 19:47:55.361
cmtdd61tv004jv3xwbhsskesy	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 496}	\N	2026-08-28 19:47:55.46
cmtdd61wn004zv3xwnnkq6gem	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 495}	\N	2026-08-28 19:47:55.559
cmtdd61ze005fv3xwdcr4y6lm	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -2, "reason": "SALE", "resultingStock": 493}	\N	2026-08-28 19:47:55.658
cmtdd622b005vv3xw6cc4is24	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 492}	\N	2026-08-28 19:47:55.763
cmtdd626a006bv3xw0xl50dv8	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 491}	\N	2026-08-28 19:47:55.907
cmtdd629j006rv3xwkhwztih8	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 490}	\N	2026-08-28 19:47:56.023
cmtdd62ei0077v3xwdyvisdif	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 489}	\N	2026-08-28 19:47:56.202
cmtdd63hg008jv3xwk1b1tr92	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 198}	\N	2026-08-28 19:47:57.23
cmtdd63k5008vv3xw3r1kp1al	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf09004sv3uwcpkuuky5	{"delta": -1, "reason": "SALE", "resultingStock": 39}	\N	2026-08-28 19:47:57.701
cmtdd63mo0097v3xwni2c2kaa	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf1f0052v3uwsuv23wed	{"delta": -1, "reason": "SALE", "resultingStock": 17}	\N	2026-08-28 19:47:57.793
cmtdd63pr009jv3xw0pgat8th	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2r005gv3uwlr9kwh43	{"delta": -1, "reason": "SALE", "resultingStock": 14}	\N	2026-08-28 19:47:57.903
cmtdd63tf009vv3xw4tkqa2sn	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 488}	\N	2026-08-28 19:47:58.036
cmtdd63xe00a7v3xwzew8hc35	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2m005ev3uwckqmzj7j	{"delta": -1, "reason": "SALE", "resultingStock": 19}	\N	2026-08-28 19:47:58.178
cmtdd646l00arv3xws19w7fkj	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf7m006gv3uwoukrbm7y	{"delta": -1, "reason": "SALE", "resultingStock": 0}	\N	2026-08-28 19:47:58.509
cmtdd64lx00blv3xwl5jz9fus	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 197}	\N	2026-08-28 19:47:59.061
cmtdd64mx00bpv3xwhbfqvz1l	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf09004sv3uwcpkuuky5	{"delta": -1, "reason": "SALE", "resultingStock": 38}	\N	2026-08-28 19:47:59.097
cmtdd64pp00c2v3xwhtedpma0	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 196}	\N	2026-08-28 19:47:59.197
cmtdd64qc00c6v3xwasobbnz6	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf09004sv3uwcpkuuky5	{"delta": -1, "reason": "SALE", "resultingStock": 37}	\N	2026-08-28 19:47:59.221
cmtdd65va00cmv3xwoacctv3g	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 195}	\N	2026-08-28 19:48:00.695
cmtdd661e00d2v3xw6e2rbzlw	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 194}	\N	2026-08-28 19:48:00.914
cmtdd67jq00egv3xwrw2pe8ho	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 486}	\N	2026-08-28 19:48:02.87
cmtdd67pq00exv3xwllym44as	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 485}	\N	2026-08-28 19:48:03.086
cmtdd67vk00f5v3xw7rhwe5lf	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtdd67ny00eqv3xw646u1p8x	{"to": "CONFIRMED", "from": "PENDING"}	\N	2026-08-28 19:48:03.296
cmtdd67ye00fav3xw18zgcsdm	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtdd67ny00eqv3xw646u1p8x	{"to": "PROCESSING", "from": "CONFIRMED"}	\N	2026-08-28 19:48:03.399
cmtdd680l00ffv3xw5r8rf2zd	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtdd67ny00eqv3xw646u1p8x	{"to": "READY_TO_SHIP", "from": "PROCESSING"}	\N	2026-08-28 19:48:03.477
cmtdd68bu00g2v3xwmidy81f7	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -2, "reason": "SALE", "resultingStock": 483}	\N	2026-08-28 19:48:03.882
cmtdd68er00gev3xwmiero1t2	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtdd68aw00fvv3xwxvgkw9pp	{"to": "CANCELLED", "from": "PENDING", "note": "Customer changed their mind"}	\N	2026-08-28 19:48:03.987
cmtdd679600dwv3xw6qiarvzb	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 487}	\N	2026-08-28 19:48:02.49
cmtdd67dt00e3v3xwvx10j173	cmsx5rcwn0000v3uwukkiufkd	payment.approved	Payment	cmtdd679j00dyv3xw4mn20hyt	{"amount": 314900, "provider": "bank_transfer"}	\N	2026-08-28 19:48:02.657
cmtdd682y00fkv3xwryv0w117	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtdd67ny00eqv3xw646u1p8x	{"to": "SHIPPED", "from": "READY_TO_SHIP"}	\N	2026-08-28 19:48:03.563
cmtdd685s00fpv3xw6xwasdsp	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtdd67ny00eqv3xw646u1p8x	{"to": "DELIVERED", "from": "SHIPPED"}	\N	2026-08-28 19:48:03.664
cmtdd68eh00gbv3xwiymhs9m9	cmsx5rcwn0000v3uwukkiufkd	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": 2, "reason": "CANCELLATION", "resultingStock": 485}	\N	2026-08-28 19:48:03.977
cmtdd68jk00grv3xwc23y6r1x	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 484}	\N	2026-08-28 19:48:04.161
cmtdd6lan00hbv3xwb8t1r9qf	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 199}	\N	2026-08-28 19:48:20.688
cmtdd6mja00htv3xwuafxvvrc	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 198}	\N	2026-08-28 19:48:22.295
cmtdd6ov400i9v3xwm1zofugh	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 197}	\N	2026-08-28 19:48:25.312
cmtdd6piq00iiv3xw4u8g322o	cmsx5rcwn0000v3uwukkiufkd	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": 1, "reason": "CANCELLATION", "resultingStock": 198}	\N	2026-08-28 19:48:26.163
cmtdd6pnx00ilv3xwpjc9b5y2	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtdd6osp00i2v3xw9bilpyxg	{"to": "CANCELLED", "from": "PENDING", "note": "Test cancellation"}	\N	2026-08-28 19:48:26.349
cmtdd6syl00j0v3xwwtyw4ad4	cmsx5rcwn0000v3uwukkiufkd	lead.updated	Lead	cmtdd6svu00iyv3xwxwxpu16i	{"status": "QUOTED", "quotedValue": 850000}	\N	2026-08-28 19:48:30.621
cmtdd6uq900jfv3xw3f5q7m7x	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 197}	\N	2026-08-28 19:48:32.913
cmtdd6v2900jxv3xwm6mh32bs	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 196}	\N	2026-08-28 19:48:33.345
cmtdef7oq00ikv3dsymstptrz	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -174, "reason": "ADJUSTMENT", "resultingStock": 25}	\N	2026-08-28 20:23:02.57
cmtdef7rw00jcv3ds7k9m90f9	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": 1, "reason": "PURCHASE_RECEIPT", "resultingStock": 12}	\N	2026-08-28 20:23:02.684
cmtdef7um00kev3dstwl7xjuf	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf7m006gv3uwoukrbm7y	{"delta": 9898, "reason": "ADJUSTMENT", "resultingStock": 9999}	\N	2026-08-28 20:23:02.783
cmtdef7vi00kqv3ds54u0ga6k	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf8w006qv3uw4kyfgcaf	{"delta": 9989, "reason": "ADJUSTMENT", "resultingStock": 9999}	\N	2026-08-28 20:23:02.815
cmtel4y64000ev32sbafkwn8y	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -2, "reason": "SALE", "resultingStock": 498}	\N	2026-08-29 16:18:47.164
cmtel4y9g000uv32snfodbo2i	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 497}	\N	2026-08-29 16:18:47.284
cmtel4ybq001av32sjdfv28n6	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 496}	\N	2026-08-29 16:18:47.367
cmtel4ye3001qv32siq58egnv	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 495}	\N	2026-08-29 16:18:47.451
cmtel4ygd0026v32ste6cw445	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -2, "reason": "SALE", "resultingStock": 493}	\N	2026-08-29 16:18:47.533
cmtel4yoa002mv32smkwk3l3n	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 492}	\N	2026-08-29 16:18:47.659
cmtel4yrj0032v32s0rygs4m9	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 491}	\N	2026-08-29 16:18:47.935
cmtel4ytz003iv32s3gte5fue	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 490}	\N	2026-08-29 16:18:48.023
cmtel4yw1003yv32s53ce9r4i	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 489}	\N	2026-08-29 16:18:48.098
cmtel4zcv005av32sduowutx9	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 24}	\N	2026-08-29 16:18:48.531
cmtel4zds005mv32sluw1quz9	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2r005gv3uwlr9kwh43	{"delta": -1, "reason": "SALE", "resultingStock": 14}	\N	2026-08-29 16:18:48.737
cmtel4zf8005yv32swr67yec6	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf09004sv3uwcpkuuky5	{"delta": -1, "reason": "SALE", "resultingStock": 39}	\N	2026-08-29 16:18:48.788
cmtel4zgs006av32sszywmktz	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf1f0052v3uwsuv23wed	{"delta": -1, "reason": "SALE", "resultingStock": 17}	\N	2026-08-29 16:18:48.845
cmtel4zie006mv32sa6z77pua	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 488}	\N	2026-08-29 16:18:48.902
cmtel4zjz006yv32s04b0869u	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2m005ev3uwckqmzj7j	{"delta": -1, "reason": "SALE", "resultingStock": 19}	\N	2026-08-29 16:18:48.959
cmtel4zo0007iv32sxckx0vmz	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf7m006gv3uwoukrbm7y	{"delta": -1, "reason": "SALE", "resultingStock": 0}	\N	2026-08-29 16:18:49.105
cmtel4zup008cv32s544t9r2k	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 23}	\N	2026-08-29 16:18:49.346
cmtel4zv4008gv32s33i5ugd8	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf09004sv3uwcpkuuky5	{"delta": -1, "reason": "SALE", "resultingStock": 38}	\N	2026-08-29 16:18:49.361
cmtel4zw6008tv32sze9vn094	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 22}	\N	2026-08-29 16:18:49.399
cmtel4zwo008xv32s80pqzsrx	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf09004sv3uwcpkuuky5	{"delta": -1, "reason": "SALE", "resultingStock": 37}	\N	2026-08-29 16:18:49.417
cmtel50ii009dv32sp3em7czd	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 21}	\N	2026-08-29 16:18:50.202
cmtel50mb009tv32si9gyl6kn	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 20}	\N	2026-08-29 16:18:50.339
cmtel517p00afv32ss1xewvhl	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 487}	\N	2026-08-29 16:18:51.109
cmtel519u00amv32sv4srg3bo	cmsx5rcwn0000v3uwukkiufkd	payment.approved	Payment	cmtel517v00ahv32sb9rrssva	{"amount": 314900, "provider": "bank_transfer"}	\N	2026-08-29 16:18:51.186
cmtel51c400azv32so54qtndl	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 486}	\N	2026-08-29 16:18:51.268
cmtel51eo00bgv32szvo6xfj2	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 485}	\N	2026-08-29 16:18:51.36
cmtel51ha00bov32sqd0a2e4t	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel51e000b9v32shrrsn8ub	{"to": "CONFIRMED", "from": "PENDING"}	\N	2026-08-29 16:18:51.454
cmtel51ip00btv32s0lh0x1w0	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel51e000b9v32shrrsn8ub	{"to": "PROCESSING", "from": "CONFIRMED"}	\N	2026-08-29 16:18:51.505
cmtel51kx00c3v32sf2r15thh	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel51e000b9v32shrrsn8ub	{"to": "SHIPPED", "from": "READY_TO_SHIP"}	\N	2026-08-29 16:18:51.586
cmtel51m500c8v32sd1syh64f	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel51e000b9v32shrrsn8ub	{"to": "DELIVERED", "from": "SHIPPED"}	\N	2026-08-29 16:18:51.63
cmtel51pn00cpv32se9tf573k	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -2, "reason": "SALE", "resultingStock": 483}	\N	2026-08-29 16:18:51.756
cmtel51ra00d1v32sjd31hy7f	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel51p000chv32sz6t1dh7o	{"to": "CANCELLED", "from": "PENDING", "note": "Customer changed their mind"}	\N	2026-08-29 16:18:51.814
cmtel51ul00div32swpeb9w9j	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 484}	\N	2026-08-29 16:18:51.934
cmtel51jx00byv32s3ultxfy8	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel51e000b9v32shrrsn8ub	{"to": "READY_TO_SHIP", "from": "PROCESSING"}	\N	2026-08-29 16:18:51.55
cmtel51r300cyv32skdh7plzu	cmsx5rcwn0000v3uwukkiufkd	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": 2, "reason": "CANCELLATION", "resultingStock": 485}	\N	2026-08-29 16:18:51.808
cmtel5fbq00gev32s2efpu7eo	cmsx5rcwn0000v3uwukkiufkd	inventory.stock_adjusted	ProductVariant	cmtel5far00gav32stcgits3e	{"delta": 5, "reason": "ADJUSTMENT", "resultingStock": 5}	\N	2026-08-29 16:19:09.398
cmtel5fbv00ggv32s3i3xsvwb	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmtel5faq00g7v32slhepye7y	{"slug": "e2e-test-lawn-suit"}	\N	2026-08-29 16:19:09.404
cmtel5fdh00glv32ss05ejxdq	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmtel5fd700giv32s4c47cyj1	{"slug": "e2e-draft-product"}	\N	2026-08-29 16:19:09.462
cmtel5fg300gqv32s6kv4hunj	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmtel5ffv00gnv32sajqru4cq	{"slug": "e2e-archive-me"}	\N	2026-08-29 16:19:09.555
cmtel5fgu00gsv32sje4t1hql	cmsx5rcwn0000v3uwukkiufkd	product.archived	Product	cmtel5ffv00gnv32sajqru4cq	{"slug": "e2e-archive-me"}	\N	2026-08-29 16:19:09.582
cmtel5hzm00h9v32s0yye5xg8	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 199}	\N	2026-08-29 16:19:12.85
cmtel5i4900hrv32statylja2	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 198}	\N	2026-08-29 16:19:13.017
cmtel5i9q00i7v32s0stxurbk	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 197}	\N	2026-08-29 16:19:13.214
cmtel5ibt00igv32suw703s5l	cmsx5rcwn0000v3uwukkiufkd	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": 1, "reason": "CANCELLATION", "resultingStock": 198}	\N	2026-08-29 16:19:13.289
cmtel5ibz00ijv32sg02xyx3t	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel5i9400i0v32slooode22	{"to": "CANCELLED", "from": "PENDING", "note": "Test cancellation"}	\N	2026-08-29 16:19:13.295
cmtel5j0p00iyv32solfdypcy	cmsx5rcwn0000v3uwukkiufkd	lead.updated	Lead	cmtel5j0600iwv32sbmxxleip	{"status": "QUOTED", "quotedValue": 850000}	\N	2026-08-29 16:19:14.186
cmtel5jsf00jdv32s079mcm2f	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 197}	\N	2026-08-29 16:19:15.184
cmtel5jyx00jvv32s9vyzh6nk	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 196}	\N	2026-08-29 16:19:15.417
cmtel5nf400khv32shzdwdgkm	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 199}	\N	2026-08-29 16:19:19.777
cmtel5nnu00l1v32spxyn2pb1	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 11}	\N	2026-08-29 16:19:20.202
cmtel5nr200l6v32skxoi4uyw	cmsx5rcwn0000v3uwukkiufkd	stitching_job.assigned	StitchingJob	cmtel5ngh00kmv32sv7sy5psx	{"tailorId": "cmsx5rdyp0002v3uwz6wvwyci"}	\N	2026-08-29 16:19:20.318
cmtel5nta00lbv32s4b7dtrev	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel5ngh00kmv32sv7sy5psx	{"to": "CUTTING", "from": "RECEIVED"}	\N	2026-08-29 16:19:20.399
cmtel5nuh00lgv32sscgpgzkn	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel5ngh00kmv32sv7sy5psx	{"to": "STITCHING", "from": "CUTTING"}	\N	2026-08-29 16:19:20.441
cmtel5nvl00llv32s6tbf1j8j	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel5ngh00kmv32sv7sy5psx	{"to": "QC", "from": "STITCHING"}	\N	2026-08-29 16:19:20.481
cmtel5nx600lqv32sn56hhvln	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel5ngh00kmv32sv7sy5psx	{"to": "STITCHING", "from": "QC", "note": "Hem is uneven on the left"}	\N	2026-08-29 16:19:20.538
cmtel5odo00lwv32sxeug2xgo	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel5ngh00kmv32sv7sy5psx	{"to": "QC", "from": "STITCHING"}	\N	2026-08-29 16:19:21.133
cmtel5of000m1v32s002k6ed8	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel5ngh00kmv32sv7sy5psx	{"to": "READY", "from": "QC"}	\N	2026-08-29 16:19:21.181
cmtel5onn00mev32s9j4e3ous	cmsx5rcwn0000v3uwukkiufkd	stitching_order.fabric_received	StitchingOrder	cmtel5ok900m3v32ski3d5odr	{"number": "STO-2026-0001"}	\N	2026-08-29 16:19:21.492
cmtel6nz3000ev3mcxd9sxivb	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 199}	\N	2026-08-29 16:20:07.263
cmtel6o3s000wv3mc7zv6ke2k	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 198}	\N	2026-08-29 16:20:07.433
cmtel6obo001cv3mcoitd8taf	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 197}	\N	2026-08-29 16:20:07.716
cmtel6oef001lv3mc2bwulj1x	cmsx5rcwn0000v3uwukkiufkd	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": 1, "reason": "CANCELLATION", "resultingStock": 198}	\N	2026-08-29 16:20:07.816
cmtel6oen001ov3mc3ekp13v5	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel6oar0015v3mccn2961jl	{"to": "CANCELLED", "from": "PENDING", "note": "Test cancellation"}	\N	2026-08-29 16:20:07.823
cmtel6p4n0023v3mc2ptnliv1	cmsx5rcwn0000v3uwukkiufkd	lead.updated	Lead	cmtel6p430021v3mcioe8jhf5	{"status": "QUOTED", "quotedValue": 850000}	\N	2026-08-29 16:20:08.759
cmtel6py3002iv3mcef200ss3	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 197}	\N	2026-08-29 16:20:09.819
cmtel6q4u0030v3mcm1yadany	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 196}	\N	2026-08-29 16:20:10.062
cmtel6tdz003kv3mc4l9u1t9e	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -2, "reason": "SALE", "resultingStock": 498}	\N	2026-08-29 16:20:14.28
cmtel6tgp0040v3mcxbo1rys4	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 497}	\N	2026-08-29 16:20:14.377
cmtel6tj6004gv3mco8deec6d	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 496}	\N	2026-08-29 16:20:14.466
cmtel6tlq004wv3mc3x4wrkjr	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 495}	\N	2026-08-29 16:20:14.558
cmtel6to4005cv3mcydxmly4q	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -2, "reason": "SALE", "resultingStock": 493}	\N	2026-08-29 16:20:14.645
cmtel6tqk005sv3mczq0v3vr6	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 492}	\N	2026-08-29 16:20:14.732
cmtel6tta0068v3mc25q49gvi	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 491}	\N	2026-08-29 16:20:14.83
cmtel6tvo006ov3mcp8rrg2bk	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 490}	\N	2026-08-29 16:20:14.917
cmtel6ty20074v3mcwi2phlwi	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 489}	\N	2026-08-29 16:20:15.002
cmtel6ugb008gv3mcsqyctvak	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 488}	\N	2026-08-29 16:20:15.437
cmtel6ujb008sv3mceh0i8gse	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf09004sv3uwcpkuuky5	{"delta": -1, "reason": "SALE", "resultingStock": 39}	\N	2026-08-29 16:20:15.768
cmtel6ulx0094v3mchittgp6v	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf1f0052v3uwsuv23wed	{"delta": -1, "reason": "SALE", "resultingStock": 17}	\N	2026-08-29 16:20:15.862
cmtel6uoa009gv3mcccg1ar91	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2m005ev3uwckqmzj7j	{"delta": -1, "reason": "SALE", "resultingStock": 19}	\N	2026-08-29 16:20:15.947
cmtel6uqc009sv3mcu9e3njx8	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2r005gv3uwlr9kwh43	{"delta": -1, "reason": "SALE", "resultingStock": 14}	\N	2026-08-29 16:20:16.021
cmtel6use00a4v3mcd6oiwfpk	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 198}	\N	2026-08-29 16:20:16.094
cmtel6ux300aov3mc7w01njct	\N	inventory.stock_adjusted	ProductVariant	cmsx5rfak0070v3uwz9neyuw2	{"delta": -1, "reason": "SALE", "resultingStock": 0}	\N	2026-08-29 16:20:16.263
cmtel6v4l00biv3mcjjsgjmvb	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 197}	\N	2026-08-29 16:20:16.533
cmtel6v4w00bmv3mc6atsa3z4	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf09004sv3uwcpkuuky5	{"delta": -1, "reason": "SALE", "resultingStock": 38}	\N	2026-08-29 16:20:16.544
cmtel6v5w00bzv3mcvg60oxj4	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 196}	\N	2026-08-29 16:20:16.58
cmtel6v6800c3v3mc65y59szq	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf09004sv3uwcpkuuky5	{"delta": -1, "reason": "SALE", "resultingStock": 37}	\N	2026-08-29 16:20:16.592
cmtel6vo600cjv3mcu24tyujn	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 195}	\N	2026-08-29 16:20:17.239
cmtel6vrj00czv3mcnjowlt6c	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 194}	\N	2026-08-29 16:20:17.359
cmtel6wfh00dpv3mc77gnr6ay	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 487}	\N	2026-08-29 16:20:18.222
cmtel6wim00e0v3mcvnxavlvz	cmsx5rcwn0000v3uwukkiufkd	payment.approved	Payment	cmtel6wfr00drv3mc5oq7xj0s	{"amount": 314900, "provider": "bank_transfer"}	\N	2026-08-29 16:20:18.334
cmtel6wl600edv3mc4iec0bry	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 486}	\N	2026-08-29 16:20:18.427
cmtel6wo500euv3mcm6yjm9t6	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 485}	\N	2026-08-29 16:20:18.533
cmtel6wq400f2v3mcm1jhz4f2	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel6wnl00env3mci83ezvzx	{"to": "CONFIRMED", "from": "PENDING"}	\N	2026-08-29 16:20:18.604
cmtel6wrg00f7v3mc24jm024z	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel6wnl00env3mci83ezvzx	{"to": "PROCESSING", "from": "CONFIRMED"}	\N	2026-08-29 16:20:18.653
cmtel6wss00fcv3mc9vba955l	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel6wnl00env3mci83ezvzx	{"to": "READY_TO_SHIP", "from": "PROCESSING"}	\N	2026-08-29 16:20:18.7
cmtel6wtz00fhv3mc1zu9bjmn	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel6wnl00env3mci83ezvzx	{"to": "SHIPPED", "from": "READY_TO_SHIP"}	\N	2026-08-29 16:20:18.744
cmtel6wv600fmv3mcnylsba76	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel6wnl00env3mci83ezvzx	{"to": "DELIVERED", "from": "SHIPPED"}	\N	2026-08-29 16:20:18.787
cmtel6wz300fzv3mcdomxsl9i	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -2, "reason": "SALE", "resultingStock": 483}	\N	2026-08-29 16:20:18.927
cmtel6x0g00g8v3mcd0977c22	cmsx5rcwn0000v3uwukkiufkd	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": 2, "reason": "CANCELLATION", "resultingStock": 485}	\N	2026-08-29 16:20:18.976
cmtel6x0m00gbv3mcnb7a9khg	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel6wyf00fsv3mcy3bqw9ue	{"to": "CANCELLED", "from": "PENDING", "note": "Customer changed their mind"}	\N	2026-08-29 16:20:18.983
cmtel6x3500gov3mck7iwk0s4	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 484}	\N	2026-08-29 16:20:19.073
cmtel76lg00j6v3mc73o3gozf	cmsx5rcwn0000v3uwukkiufkd	inventory.stock_adjusted	ProductVariant	cmtel76jv00j2v3mc03tcrfz3	{"delta": 5, "reason": "ADJUSTMENT", "resultingStock": 5}	\N	2026-08-29 16:20:31.396
cmtel76lm00j8v3mcw5ysfm92	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmtel76jv00izv3mc0ykbtx63	{"slug": "e2e-test-lawn-suit"}	\N	2026-08-29 16:20:31.403
cmtel76nf00jdv3mc1o89xgw8	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmtel76n700jav3mcrnkr4rld	{"slug": "e2e-draft-product"}	\N	2026-08-29 16:20:31.468
cmtel76py00jiv3mctyqp2atj	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmtel76po00jfv3mcd1am0yix	{"slug": "e2e-archive-me"}	\N	2026-08-29 16:20:31.559
cmtel76qq00jkv3mcd22fhrfo	cmsx5rcwn0000v3uwukkiufkd	product.archived	Product	cmtel76po00jfv3mcd1am0yix	{"slug": "e2e-archive-me"}	\N	2026-08-29 16:20:31.586
cmtel7aqy00k3v3mcevep9jcu	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 199}	\N	2026-08-29 16:20:36.778
cmtel7b2e00knv3mc1v3kh6f1	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 10}	\N	2026-08-29 16:20:37.19
cmtel7b6j00ksv3mc4ix233b9	cmsx5rcwn0000v3uwukkiufkd	stitching_job.assigned	StitchingJob	cmtel7atc00k8v3mcqgt1cpk2	{"tailorId": "cmsx5rdyp0002v3uwz6wvwyci"}	\N	2026-08-29 16:20:37.34
cmtel7b9b00kxv3mcznnyevl6	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel7atc00k8v3mcqgt1cpk2	{"to": "CUTTING", "from": "RECEIVED"}	\N	2026-08-29 16:20:37.44
cmtel7bac00l2v3mcosydy49m	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel7atc00k8v3mcqgt1cpk2	{"to": "STITCHING", "from": "CUTTING"}	\N	2026-08-29 16:20:37.477
cmtel7bbc00l7v3mcaf3uixk2	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel7atc00k8v3mcqgt1cpk2	{"to": "QC", "from": "STITCHING"}	\N	2026-08-29 16:20:37.512
cmtel7bcu00lcv3mcr7gm1tiw	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel7atc00k8v3mcqgt1cpk2	{"to": "STITCHING", "from": "QC", "note": "Hem is uneven on the left"}	\N	2026-08-29 16:20:37.566
cmtel7c1e00liv3mczr2n9c8e	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel7atc00k8v3mcqgt1cpk2	{"to": "QC", "from": "STITCHING"}	\N	2026-08-29 16:20:38.45
cmtel7c3b00lnv3mco34vegd8	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel7atc00k8v3mcqgt1cpk2	{"to": "READY", "from": "QC"}	\N	2026-08-29 16:20:38.519
cmtel7cdc00m0v3mcp8bw0rib	cmsx5rcwn0000v3uwukkiufkd	stitching_order.fabric_received	StitchingOrder	cmtel7c7t00lpv3mc7n7o6lq7	{"number": "STO-2026-0001"}	\N	2026-08-29 16:20:38.881
cmtel8ut5000ev330ra21hk02	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 199}	\N	2026-08-29 16:21:49.433
cmtel8uxk000wv330r59aqbbx	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 198}	\N	2026-08-29 16:21:49.592
cmtel8v4b001cv330ofwgb65q	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 197}	\N	2026-08-29 16:21:49.835
cmtel8v6s001lv330krvmwckr	cmsx5rcwn0000v3uwukkiufkd	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": 1, "reason": "CANCELLATION", "resultingStock": 198}	\N	2026-08-29 16:21:49.924
cmtel8v70001ov3300cl97vv9	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel8v3q0015v330mn0ea5vm	{"to": "CANCELLED", "from": "PENDING", "note": "Test cancellation"}	\N	2026-08-29 16:21:49.932
cmtel8vwi0023v3306292e0r8	cmsx5rcwn0000v3uwukkiufkd	lead.updated	Lead	cmtel8vvv0021v330lo0px1wi	{"status": "QUOTED", "quotedValue": 850000}	\N	2026-08-29 16:21:50.851
cmtel8wpq002iv330d51expzc	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 197}	\N	2026-08-29 16:21:51.902
cmtel8wwf0030v330ar3t6hit	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 196}	\N	2026-08-29 16:21:52.143
cmtel8zme003iv330zibe3kp6	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -2, "reason": "SALE", "resultingStock": 498}	\N	2026-08-29 16:21:55.67
cmtel8zp3003yv330isu189nn	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 497}	\N	2026-08-29 16:21:55.767
cmtel8zrm004ev330ke6lkeev	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 496}	\N	2026-08-29 16:21:55.859
cmtel8zu5004uv330haynzq48	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 495}	\N	2026-08-29 16:21:55.95
cmtel8zwn005av330gbjmdkh9	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -2, "reason": "SALE", "resultingStock": 493}	\N	2026-08-29 16:21:56.039
cmtel8zyy005qv330u1mg7evs	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 492}	\N	2026-08-29 16:21:56.123
cmtel901e0066v330txmyynyh	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 491}	\N	2026-08-29 16:21:56.21
cmtel903s006mv330e0poie7q	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 490}	\N	2026-08-29 16:21:56.296
cmtel906w0072v3300w9o27jb	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 489}	\N	2026-08-29 16:21:56.409
cmtel90ti008ev3300hw1rb07	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2m005ev3uwckqmzj7j	{"delta": -1, "reason": "SALE", "resultingStock": 19}	\N	2026-08-29 16:21:56.979
cmtel90v0008qv33086go4ov0	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2r005gv3uwlr9kwh43	{"delta": -1, "reason": "SALE", "resultingStock": 14}	\N	2026-08-29 16:21:57.277
cmtel90wn0092v330a4jgo467	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 488}	\N	2026-08-29 16:21:57.336
cmtel90yg009ev330q19tppzl	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 198}	\N	2026-08-29 16:21:57.401
cmtel9103009qv330tpd25e6c	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf1f0052v3uwsuv23wed	{"delta": -1, "reason": "SALE", "resultingStock": 17}	\N	2026-08-29 16:21:57.459
cmtel911n00a2v330q5dlxa1a	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf09004sv3uwcpkuuky5	{"delta": -1, "reason": "SALE", "resultingStock": 39}	\N	2026-08-29 16:21:57.516
cmtel915w00amv330iqz9abzu	\N	inventory.stock_adjusted	ProductVariant	cmsx5rfcw007kv3uwmbuiq6zn	{"delta": -1, "reason": "SALE", "resultingStock": 0}	\N	2026-08-29 16:21:57.668
cmtel91d900bgv330xy327al7	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 197}	\N	2026-08-29 16:21:57.933
cmtel91dl00bkv330zv50jknv	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf09004sv3uwcpkuuky5	{"delta": -1, "reason": "SALE", "resultingStock": 38}	\N	2026-08-29 16:21:57.945
cmtel91el00bxv3309ng889gv	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 196}	\N	2026-08-29 16:21:57.981
cmtel91ew00c1v330uzliz4n1	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf09004sv3uwcpkuuky5	{"delta": -1, "reason": "SALE", "resultingStock": 37}	\N	2026-08-29 16:21:57.992
cmtel91wo00chv330vpea4oxm	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 195}	\N	2026-08-29 16:21:58.632
cmtel920b00cxv330liqlw8ys	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 194}	\N	2026-08-29 16:21:58.763
cmtel92kr00dnv330t4yv02lp	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 487}	\N	2026-08-29 16:21:59.499
cmtel92mk00duv3301svmeqmg	cmsx5rcwn0000v3uwukkiufkd	payment.approved	Payment	cmtel92kw00dpv330u43aukon	{"amount": 314900, "provider": "bank_transfer"}	\N	2026-08-29 16:21:59.564
cmtel92ow00e7v3306upktx2j	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 486}	\N	2026-08-29 16:21:59.649
cmtel92re00eov330pbpc713u	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 485}	\N	2026-08-29 16:21:59.739
cmtel92t400ewv330b0n6odss	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel92qw00ehv330y86fmywr	{"to": "CONFIRMED", "from": "PENDING"}	\N	2026-08-29 16:21:59.8
cmtel92xo00fgv3307l6nbn0q	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel92qw00ehv330y86fmywr	{"to": "DELIVERED", "from": "SHIPPED"}	\N	2026-08-29 16:21:59.965
cmtel932300g2v3303l2nmu7o	cmsx5rcwn0000v3uwukkiufkd	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": 2, "reason": "CANCELLATION", "resultingStock": 485}	\N	2026-08-29 16:22:00.123
cmtel934s00giv3308o6ldwe1	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 484}	\N	2026-08-29 16:22:00.22
cmtel92ub00f1v330o88t0j6v	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel92qw00ehv330y86fmywr	{"to": "PROCESSING", "from": "CONFIRMED"}	\N	2026-08-29 16:21:59.843
cmtel92vj00f6v330fuhdabqr	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel92qw00ehv330y86fmywr	{"to": "READY_TO_SHIP", "from": "PROCESSING"}	\N	2026-08-29 16:21:59.888
cmtel92wl00fbv330enrvi6fu	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel92qw00ehv330y86fmywr	{"to": "SHIPPED", "from": "READY_TO_SHIP"}	\N	2026-08-29 16:21:59.925
cmtel930u00ftv330qf4we5b9	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -2, "reason": "SALE", "resultingStock": 483}	\N	2026-08-29 16:22:00.078
cmtel932a00g5v330qmss6xlr	cmsx5rcwn0000v3uwukkiufkd	order.status_changed	Order	cmtel930900fmv330anlzuy0y	{"to": "CANCELLED", "from": "PENDING", "note": "Customer changed their mind"}	\N	2026-08-29 16:22:00.13
cmtel97u900h8v330flj3bseh	\N	inventory.stock_adjusted	ProductVariant	cmsx5rexv004iv3uwhtv4yelr	{"delta": -1, "reason": "SALE", "resultingStock": 199}	\N	2026-08-29 16:22:06.322
cmtel986p00hsv33010y71mn4	\N	inventory.stock_adjusted	ProductVariant	cmsx5rf2i005cv3uwk782tbox	{"delta": -1, "reason": "SALE", "resultingStock": 9}	\N	2026-08-29 16:22:06.77
cmtel98c500hxv330p3lc9liv	cmsx5rcwn0000v3uwukkiufkd	stitching_job.assigned	StitchingJob	cmtel97wd00hdv3303kne92js	{"tailorId": "cmsx5rdyp0002v3uwz6wvwyci"}	\N	2026-08-29 16:22:06.966
cmtel98fs00i2v330tdly7u9n	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel97wd00hdv3303kne92js	{"to": "CUTTING", "from": "RECEIVED"}	\N	2026-08-29 16:22:07.096
cmtel98h700i7v330e13mfq6s	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel97wd00hdv3303kne92js	{"to": "STITCHING", "from": "CUTTING"}	\N	2026-08-29 16:22:07.148
cmtel98ip00icv330gcevhsl3	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel97wd00hdv3303kne92js	{"to": "QC", "from": "STITCHING"}	\N	2026-08-29 16:22:07.201
cmtel98lf00ihv330pgitey6w	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel97wd00hdv3303kne92js	{"to": "STITCHING", "from": "QC", "note": "Hem is uneven on the left"}	\N	2026-08-29 16:22:07.3
cmtel996g00inv330j8zhu6vl	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel97wd00hdv3303kne92js	{"to": "QC", "from": "STITCHING"}	\N	2026-08-29 16:22:08.057
cmtel997p00isv330ytgrpmsa	cmsx5rdyp0002v3uwz6wvwyci	stitching_job.stage_changed	StitchingJob	cmtel97wd00hdv3303kne92js	{"to": "READY", "from": "QC"}	\N	2026-08-29 16:22:08.101
cmtel99eb00j5v3301twsjwl9	cmsx5rcwn0000v3uwukkiufkd	stitching_order.fabric_received	StitchingOrder	cmtel99ay00iuv330bewdfhyr	{"number": "STO-2026-0001"}	\N	2026-08-29 16:22:08.34
cmtel9elv00jkv330zhq12njg	cmsx5rcwn0000v3uwukkiufkd	inventory.stock_adjusted	ProductVariant	cmtel9el300jgv330sllmr3f6	{"delta": 5, "reason": "ADJUSTMENT", "resultingStock": 5}	\N	2026-08-29 16:22:15.092
cmtel9em100jmv330p3zttvhl	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmtel9el300jdv330cbfx989a	{"slug": "e2e-test-lawn-suit"}	\N	2026-08-29 16:22:15.097
cmtel9enl00jrv330mg3ctvr7	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmtel9enc00jov33072htdzcz	{"slug": "e2e-draft-product"}	\N	2026-08-29 16:22:15.153
cmtel9eq600jwv3305zug1rw8	cmsx5rcwn0000v3uwukkiufkd	product.created	Product	cmtel9epy00jtv330819pnabh	{"slug": "e2e-archive-me"}	\N	2026-08-29 16:22:15.246
cmtel9eqt00jyv330dqtxw0us	cmsx5rcwn0000v3uwukkiufkd	product.archived	Product	cmtel9epy00jtv330819pnabh	{"slug": "e2e-archive-me"}	\N	2026-08-29 16:22:15.27
\.


--
-- Data for Name: Cart; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Cart" (id, token, "userId", "createdAt", "updatedAt", "expiresAt") FROM stdin;
cmsx5k6ys0001v3q0gn7e6hqm	SV5ziNBsJa-RsU1QHmbZDOOXYPSJMudH	cmsx5rehl0005v3uwdwy4jud8	2026-08-17 11:30:39.532	2026-08-17 11:59:57.765	2026-09-16 11:30:39.518
cmsxjy9u80001v3z4fi06tf79	Enf0L8TwqofXmOPFOAFYL8sttff2Qdhr	\N	2026-08-17 18:13:30.785	2026-08-17 18:13:30.785	2026-09-16 18:13:30.776
cmt1c9ndj0001v33g0ltkxkk0	nk-VnOa7zui_8dI9AdGSkqcKW2-VU4h3	\N	2026-08-20 09:49:29.618	2026-08-20 09:49:29.618	2026-09-19 09:49:29.605
cmt3hsnc20003v32o14n7hw0s	4W5rFhDM_x0l1EM8TogWmqB4S9StX-Qw	\N	2026-08-21 21:59:46.467	2026-08-21 21:59:46.467	2026-09-20 21:59:46.462
cmt3hsnd70005v32oned6kns3	USuRKzQUCRJ0yxD9PIoXLmFfbtyHaTrI	\N	2026-08-21 21:59:46.508	2026-08-21 21:59:46.508	2026-09-20 21:59:46.504
cmt3hsnfc0009v32oitwgyscd	b3OGWW6BMnwY4iBu0sLbWiyqTDPo2aie	\N	2026-08-21 21:59:46.584	2026-08-21 21:59:46.584	2026-09-20 21:59:46.581
cmt3hsnhh000dv32o9awr8p1k	ZcmdBlkflqeKoUsVuj-cJl239FLfqsS-	\N	2026-08-21 21:59:46.661	2026-08-21 21:59:46.661	2026-09-20 21:59:46.657
cmt3hsni4000fv32ofif23nqr	j4GLhGNHMTaGUdbnEAHyzFKwBARcULsD	\N	2026-08-21 21:59:46.684	2026-08-21 21:59:46.684	2026-09-20 21:59:46.681
cmt3hsolg000pv32of1zvw709	wsOh5Wa9njpZ6QnCg03WtCs88QOCgFJU	cmsx5rcwn0000v3uwukkiufkd	2026-08-21 21:59:48.1	2026-08-21 21:59:48.1	2026-09-20 21:59:48.096
cmt3hson6000rv32o62r50kxj	geB0qFkzlVTu_xWe7DhBSLbUBFK1p0xv	\N	2026-08-21 21:59:48.162	2026-08-21 21:59:48.162	2026-09-20 21:59:48.159
cmt3hsopz000tv32ot3dt611x	NcHeAwR07SbOBs79ufdQB3YLx5AQ5MRJ	\N	2026-08-21 21:59:48.263	2026-08-21 21:59:48.263	2026-09-20 21:59:48.26
cmt3hsosf000xv32olbk1uhbp	mfMafBWwvqrOm1r2K2zzy8uyCWQt7eL5	\N	2026-08-21 21:59:48.352	2026-08-21 21:59:48.352	2026-09-20 21:59:48.348
cmt3hsott000zv32orp4w77vo	eLZF6LtsuvZv9y6_Y7LyHe_fvW3S2wRH	\N	2026-08-21 21:59:48.401	2026-08-21 21:59:48.401	2026-09-20 21:59:48.397
cmt3hsoxk0013v32orglmburt	__gRNC1Qbh2gNl4ETc9bi9uU27RsxRlB	\N	2026-08-21 21:59:48.537	2026-08-21 21:59:48.537	2026-09-20 21:59:48.533
cmt3hsoyv0017v32objtrtsh3	n-nSHPNKrUS489lPz6vT0bRtZu4BCLUs	\N	2026-08-21 21:59:48.584	2026-08-21 21:59:48.584	2026-09-20 21:59:48.58
cmt3hsp0b001bv32o4eszoubg	0jB-KbqBfbkRtV5Fb-bztUq-ub42_EyL	\N	2026-08-21 21:59:48.635	2026-08-21 21:59:48.635	2026-09-20 21:59:48.631
cmt3hsp11001dv32oconvm30b	1TM3x9xF1wuBxtEThs2WmMYIEKqwzQiX	\N	2026-08-21 21:59:48.661	2026-08-21 21:59:48.661	2026-09-20 21:59:48.658
cmt3hsp2g001hv32orc336k26	sLVwHZSrqHxc6dDZ41if4-Nxle9hAnUY	\N	2026-08-21 21:59:48.712	2026-08-21 21:59:48.712	2026-09-20 21:59:48.709
cmt3hsp3u001lv32opl8x6zmq	S3u7yOOd2rknj57Bm8HdS4OK7Z4WZ6_u	\N	2026-08-21 21:59:48.762	2026-08-21 21:59:48.762	2026-09-20 21:59:48.759
cmt3htbwc0003v3morwwgkxgm	f-SjuTogv3_yDGjIliS_pSvchA0Lg4nq	\N	2026-08-21 22:00:18.3	2026-08-21 22:00:18.3	2026-09-20 22:00:18.296
cmt3htc06000fv3mo0pqkydq3	ZD8vvFi-1VYnRKzGOlBldjX5hWi3NubR	\N	2026-08-21 22:00:18.438	2026-08-21 22:00:18.438	2026-09-20 22:00:18.435
cmt3htc2o000rv3morcrxitsp	hphJHdhBQI-LlSXmu8CKvu0y049Fp_If	\N	2026-08-21 22:00:18.528	2026-08-21 22:00:18.528	2026-09-20 22:00:18.525
cmt3htc4y0013v3mol8gpg4b3	f7jj1BaiVfEYtkEWOeifvquccxnuVj7E	\N	2026-08-21 22:00:18.611	2026-08-21 22:00:18.611	2026-09-20 22:00:18.608
cmt3htc7b001fv3moj1dh8ylf	52Xdx-FBfaNgWFyptlSbJBN9p92yeEUt	\N	2026-08-21 22:00:18.695	2026-08-21 22:00:18.695	2026-09-20 22:00:18.692
cmt3htc9i001rv3mobs2oaezh	-CS6BwcG8m-SVgumXgf7mqo2xvOxDhSh	\N	2026-08-21 22:00:18.774	2026-08-21 22:00:18.774	2026-09-20 22:00:18.771
cmt3htcc40023v3mo2sxn82ly	jjHy1WrZmqHPOTPQv_kQgjxFk8qdWTsR	\N	2026-08-21 22:00:18.868	2026-08-21 22:00:18.868	2026-09-20 22:00:18.865
cmt3htce7002fv3mohhb12qjp	fX9m6chjNtwpAN892JVz90itfZcRGBm_	\N	2026-08-21 22:00:18.944	2026-08-21 22:00:18.944	2026-09-20 22:00:18.94
cmt3htcg8002rv3momm2v2zbp	wd9nfbtgDS-yGpIRHwFTauyehTO-ZVTo	\N	2026-08-21 22:00:19.017	2026-08-21 22:00:19.017	2026-09-20 22:00:19.014
cmt3htcia0033v3mo20sojrbg	hIaigi8wJ5rl5d11PY_QGHKGFaiOM8bq	\N	2026-08-21 22:00:19.091	2026-08-21 22:00:19.091	2026-09-20 22:00:19.087
cmt3htcjt0037v3molra6u2ps	_dCe_h6mzlIj_aM0DhnEeyaD9JXTTlgT	\N	2026-08-21 22:00:19.146	2026-08-21 22:00:19.146	2026-09-20 22:00:19.143
cmt3htcl6003bv3mou1u2xq3f	gqM6iweVu912qZ3uVZLF629buE-D7nyN	\N	2026-08-21 22:00:19.195	2026-08-21 22:00:19.195	2026-09-20 22:00:19.192
cmt3htdc5003tv3mo7qwpj2ae	3k_2gEq3GQ1MdRO4V0usGFcF2kCjWKGI	\N	2026-08-21 22:00:20.166	2026-08-21 22:00:20.166	2026-09-20 22:00:20.163
cmt3htdzn004bv3mo7qni90pb	smiv454bHkNMPdQJrb6ur34ajiVNwF8r	\N	2026-08-21 22:00:21.011	2026-08-21 22:00:21.011	2026-09-20 22:00:21.007
cmt3hte3k004rv3mogy0tprrm	4_YJKZrpMq1kOwcx9tEMYn05DLC4Rb_x	\N	2026-08-21 22:00:21.152	2026-08-21 22:00:21.152	2026-09-20 22:00:21.149
cmt3hte5z0054v3mom9arygpl	OrsDA-k9RxuGb6B1mWZzG16W7m0YAIMY	\N	2026-08-21 22:00:21.24	2026-08-21 22:00:21.24	2026-09-20 22:00:21.237
cmt3htedv0065v3moyvu8gp80	q442dMOn_biMFITB4U3fbdnsMbg0qBmG	\N	2026-08-21 22:00:21.524	2026-08-21 22:00:21.524	2026-09-20 22:00:21.521
cmt3htehs006qv3mof9z8osxo	RFXUqhyQeh6g2hzaIa9NQ0_1tud9viyT	\N	2026-08-21 22:00:21.664	2026-08-21 22:00:21.664	2026-09-20 22:00:21.661
cmt3hu0jy000lv3wccc6hne7y	AIAY4h1gMRNdys0KSVk_rkv8IAlPeWid	\N	2026-08-21 22:00:50.255	2026-08-21 22:00:50.255	2026-09-20 22:00:50.24
cmt3hu50m002bv3wcnlqpd246	GKKvMyy3pKV3xcBm-0-RTQDE809sjl2T	\N	2026-08-21 22:00:56.038	2026-08-21 22:00:56.038	2026-09-20 22:00:56.023
cmt3hu554002pv3wcpgbhgbyl	FtiSE_cJ4EiIMKdu3KxOFp_Psd48wxQL	\N	2026-08-21 22:00:56.2	2026-08-21 22:00:56.2	2026-09-20 22:00:56.185
cmt3hu5g60031v3wcktxsylf1	xJd-Tr9CE9EYKqzmqOOv6PeRa63ZRPK8	\N	2026-08-21 22:00:56.598	2026-08-21 22:00:56.598	2026-09-20 22:00:56.583
cmt3hu72x003zv3wcy9mnczbv	4d16QbZ0fttNcuavPNg8QijqCoYX7QfF	\N	2026-08-21 22:00:58.714	2026-08-21 22:00:58.714	2026-09-20 22:00:58.699
cmt3hu79h004dv3wca9rp5bkn	f3PgLduX1R_ntKKiR5DzGAQz2J19LR_G	\N	2026-08-21 22:00:58.95	2026-08-21 22:00:58.95	2026-09-20 22:00:58.935
cmt3hulap005yv3wcj04u6kej	I6EFAxbbL6qhlNyPh1-GKkKPFC26K8hM	\N	2026-08-21 22:01:17.137	2026-08-21 22:01:17.137	2026-09-20 22:01:17.122
cmt3hulbc0060v3wc0xhkqofo	_g9Y1Sy8Xu5N7g77vVH9lvbnfj5RkY_B	\N	2026-08-21 22:01:17.16	2026-08-21 22:01:17.16	2026-09-20 22:01:17.145
cmt3hulcz0064v3wcejdrmxeh	NzJD3PRCdCaXvly0vKi7r2l7JenktzBe	\N	2026-08-21 22:01:17.219	2026-08-21 22:01:17.219	2026-09-20 22:01:17.205
cmt3hulet0068v3wclz37xx59	T480cHsG0oFn6MFzwKvAJHtaXlFHNbJO	\N	2026-08-21 22:01:17.285	2026-08-21 22:01:17.285	2026-09-20 22:01:17.27
cmt3hulfa006av3wci9u6u18k	yqlM70Cj12vkXJNl-8msgPV4icfq64yD	\N	2026-08-21 22:01:17.302	2026-08-21 22:01:17.302	2026-09-20 22:01:17.288
cmt3humbv006kv3wc5mhrzsue	qlvC0Gv5yTi6ARcCWU8_YhxhCP_p3pA4	\N	2026-08-21 22:01:18.476	2026-08-21 22:01:18.476	2026-09-20 22:01:18.461
cmt3humf7006mv3wcmpy1t7zm	qZ1O4_Es-BQsISy21CuCi45zdx2A3F1d	\N	2026-08-21 22:01:18.595	2026-08-21 22:01:18.595	2026-09-20 22:01:18.58
cmt3humhj006qv3wchf3p3f03	8mLmoTWEbZeO1L5v0e7q7mkkYnWaTCAs	\N	2026-08-21 22:01:18.679	2026-08-21 22:01:18.679	2026-09-20 22:01:18.664
cmt3humiq006sv3wc816p28ha	Xj98fxEGlRMDGTZ3_kPY0IVNjB3Uobry	\N	2026-08-21 22:01:18.723	2026-08-21 22:01:18.723	2026-09-20 22:01:18.708
cmt3humme006wv3wcfoh0ncsc	AKkInTcqOuq5Nbf-puaZhBwQ-y170w7B	\N	2026-08-21 22:01:18.855	2026-08-21 22:01:18.855	2026-09-20 22:01:18.84
cmt3humo60070v3wcycoa7h8l	rBoaRaFLCcryKqh4ovN-gM9uDevIT4l1	\N	2026-08-21 22:01:18.918	2026-08-21 22:01:18.918	2026-09-20 22:01:18.903
cmt3humph0074v3wcocplogyi	9eMDzkTnkVTrikyYxteep8J30-JEDRCU	\N	2026-08-21 22:01:18.965	2026-08-21 22:01:18.965	2026-09-20 22:01:18.951
cmt3humq40076v3wcul4ip4aj	fOF9LkgSdHxgGVobNNvZa4eZOPwrwPqQ	\N	2026-08-21 22:01:18.988	2026-08-21 22:01:18.988	2026-09-20 22:01:18.974
cmt3humrh007av3wcnnj7de9v	am7SLTkgZviWteB34kUOhMMsDKRaV-AZ	\N	2026-08-21 22:01:19.037	2026-08-21 22:01:19.037	2026-09-20 22:01:19.022
cmt3humss007ev3wcs09sklfi	9GLu8n5Z03TOphjH6icVCye0cRdB2AWA	\N	2026-08-21 22:01:19.085	2026-08-21 22:01:19.085	2026-09-20 22:01:19.07
cmt3hupjv007wv3wczbauyz0o	vu_4w-38IB3OShDid_pDkZDWiWWJb8yJ	\N	2026-08-21 22:01:22.651	2026-08-21 22:01:22.651	2026-09-20 22:01:22.636
cmt3hupn20088v3wcsw5lbwyq	AYve3XFYvXFbvUgAOblHe9BqRXu3qhu9	\N	2026-08-21 22:01:22.766	2026-08-21 22:01:22.766	2026-09-20 22:01:22.751
cmt3hupp1008kv3wcc9vthm7n	XSvZjnbB8oXH0HdeK3NbZXtvRGoHJruq	\N	2026-08-21 22:01:22.838	2026-08-21 22:01:22.838	2026-09-20 22:01:22.823
cmt3hupr1008wv3wc550pv2yt	da4pJ7RPoM1yj7bvJA95U8nkpOvLE2l-	\N	2026-08-21 22:01:22.909	2026-08-21 22:01:22.909	2026-09-20 22:01:22.895
cmt3hupt10098v3wcy6hygi3d	dUTzuj1mFYncsi6SY7c52RZH_UfSy9RR	\N	2026-08-21 22:01:22.981	2026-08-21 22:01:22.981	2026-09-20 22:01:22.967
cmt3hupuz009kv3wcf45eb5k7	cjY288TS0wuQo8baBVmfesmQyWUQczd6	\N	2026-08-21 22:01:23.052	2026-08-21 22:01:23.052	2026-09-20 22:01:23.037
cmt3hupx9009wv3wcyfp4966v	6hwgNIlMIQ6y40SXtvPcy_QEEXA0RPm3	\N	2026-08-21 22:01:23.133	2026-08-21 22:01:23.133	2026-09-20 22:01:23.118
cmt3hupzc00a8v3wcledvh5ba	-eFhGDmsmMm18cRTFnb2f06jsQEb9Ubn	\N	2026-08-21 22:01:23.209	2026-08-21 22:01:23.209	2026-09-20 22:01:23.194
cmt3huq1800akv3wcyspo2iy8	pQmwHAD8nwOejSZ2NiwCsPXeg-YLhti4	\N	2026-08-21 22:01:23.276	2026-08-21 22:01:23.276	2026-09-20 22:01:23.261
cmt3huq3400awv3wczcrwzhao	1GkzNGbrE63PPgpQPTk388cbYVQMX6N1	\N	2026-08-21 22:01:23.345	2026-08-21 22:01:23.345	2026-09-20 22:01:23.33
cmt3huq4p00b0v3wcolprsufw	ChTXpVDeMhDsWimiESCrFrETVnPR6bdd	\N	2026-08-21 22:01:23.401	2026-08-21 22:01:23.401	2026-09-20 22:01:23.386
cmt3huq5x00b4v3wc1nt9o6e7	GFsPTsOye7_5zy4_HI5f1Iux2UpkvnS0	\N	2026-08-21 22:01:23.446	2026-08-21 22:01:23.446	2026-09-20 22:01:23.431
cmt3huqwd00bkv3wcoe5x0bh6	0J-0x6y6Z6dHTsxhx2Rv3qbddCiiKWXJ	\N	2026-08-21 22:01:24.397	2026-08-21 22:01:24.397	2026-09-20 22:01:24.382
cmt3hurji00c2v3wcckmx03jq	fkOb1Y3cuJssHFdazS7Jaz6L0MCzGCDN	\N	2026-08-21 22:01:25.23	2026-08-21 22:01:25.23	2026-09-20 22:01:25.215
cmt3hurn400civ3wcmes3abqu	BXgRI1lN6TzHLi02kZeGASRwa1Zcf4dA	\N	2026-08-21 22:01:25.36	2026-08-21 22:01:25.36	2026-09-20 22:01:25.345
cmt3hurp200cvv3wc5up277p3	GU31dXYNoWIjIFoid8GmziQcVoM_Oked	\N	2026-08-21 22:01:25.43	2026-08-21 22:01:25.43	2026-09-20 22:01:25.416
cmt3hury700dwv3wcmf1nwbwh	0N8kuU12bJRM4siTgo5vUgxMQpCc191E	\N	2026-08-21 22:01:25.76	2026-08-21 22:01:25.76	2026-09-20 22:01:25.745
cmt3hus1900edv3wc5jgbd5j2	CPznudPiZ0wCQuERbNVOX0dhDJ_jeArS	\N	2026-08-21 22:01:25.869	2026-08-21 22:01:25.869	2026-09-20 22:01:25.855
cmt723j3i0004v3z8n7jr5ci0	UFv3mVKLU0Y5LM9cks9QY_MFSikSXYOw	\N	2026-08-24 09:51:25.039	2026-08-24 09:51:25.039	2026-09-23 09:51:25.036
cmtdd5wpb001kv3xw8jcbmu3a	CFCj2GGLv7GKIkjAIZ_tPeBUDIDhHz0F	\N	2026-08-28 19:47:48.815	2026-08-28 19:47:48.815	2026-09-27 19:47:48.812
cmtdd61ke003cv3xw7dgujeij	mY5h96aQd8dzs4hAWJ91dg5Y4tkFR42w	\N	2026-08-28 19:47:55.119	2026-08-28 19:47:55.119	2026-09-27 19:47:55.115
cmtdd61ow003sv3xw0bchaqd3	L2GOn8Dzy3eVfpVt5W_NH2pNKhjnn1EN	\N	2026-08-28 19:47:55.28	2026-08-28 19:47:55.28	2026-09-27 19:47:55.277
cmtdd61rq0048v3xwwqgq4ths	MIM32nJa4dofPAMuNJEun21RLZcK--Oe	\N	2026-08-28 19:47:55.382	2026-08-28 19:47:55.382	2026-09-27 19:47:55.379
cmtdd61ui004ov3xwhejz21wa	nsQNmgoMYFVMm99nAluY6VU33AE2QQy4	\N	2026-08-28 19:47:55.483	2026-08-28 19:47:55.483	2026-09-27 19:47:55.48
cmtdd61xa0054v3xwyzst77fs	37nDf9okfUa7fCB-PFMVN2nFbY92IQTY	\N	2026-08-28 19:47:55.582	2026-08-28 19:47:55.582	2026-09-27 19:47:55.579
cmtdd6203005kv3xwwm7awd2d	WUORhUZKMEMjlAaohVDsUY8vns8oEvtW	\N	2026-08-28 19:47:55.683	2026-08-28 19:47:55.683	2026-09-27 19:47:55.68
cmtdd623l0060v3xwamhp1can	3eHhIdSCNLVqqnpbqFtdlcxlFW7CWWBD	\N	2026-08-28 19:47:55.809	2026-08-28 19:47:55.809	2026-09-27 19:47:55.806
cmtdd6277006gv3xwiwj150p5	cYabK6dI8eiIPfplvRd-str3LmX-eEke	\N	2026-08-28 19:47:55.939	2026-08-28 19:47:55.939	2026-09-27 19:47:55.936
cmtdd62as006wv3xwivvy5d8a	Sm-puo3_UcnPH33pNOO0cDd6fCr3o7yc	\N	2026-08-28 19:47:56.068	2026-08-28 19:47:56.068	2026-09-27 19:47:56.064
cmtdd62fy007cv3xwo4e32kcx	_Uoe5MPC0uyHrAlgv8hIejp-ugw25IX_	\N	2026-08-28 19:47:56.255	2026-08-28 19:47:56.255	2026-09-27 19:47:56.25
cmtdd62kg007gv3xwzktlau8a	5d-NkUa1P6YHcPBCbAXYc11yb9a-MMBE	\N	2026-08-28 19:47:56.417	2026-08-28 19:47:56.417	2026-09-27 19:47:56.411
cmtdd62nz007kv3xwwpjuy652	OOcvEToLSzmzG2sl8-TXoDTX70-NR2Pw	\N	2026-08-28 19:47:56.543	2026-08-28 19:47:56.543	2026-09-27 19:47:56.539
cmtdd62r5007ov3xwg06ny3dk	NG5D33g7cqg2_NAMbjDo3ZaJc6eQtU6G	\N	2026-08-28 19:47:56.657	2026-08-28 19:47:56.657	2026-09-27 19:47:56.653
cmtdd62ta007sv3xwnxbm7994	nJ3vcx3XSE6CrlNSvxhmaYQhscceN57L	\N	2026-08-28 19:47:56.734	2026-08-28 19:47:56.734	2026-09-27 19:47:56.73
cmtdd62ut007wv3xwijejreha	g8l3yBABiUufjQHNzKRJCN9h8L0wDin4	\N	2026-08-28 19:47:56.789	2026-08-28 19:47:56.789	2026-09-27 19:47:56.786
cmtdd62wr0080v3xw3rit9wds	wwLUAdzRRblGLfRlnQuu3BScV5hDFUsJ	\N	2026-08-28 19:47:56.859	2026-08-28 19:47:56.859	2026-09-27 19:47:56.854
cmtdd62yf0084v3xwnfwzmjhg	J9w5H3aGaoDks8IMERdVkIQ0ZA2zbHDT	\N	2026-08-28 19:47:56.92	2026-08-28 19:47:56.92	2026-09-27 19:47:56.916
cmtdd63060088v3xwhxdolgye	QeJ2h75rCtwbxRimhe8D2wX94YiE_YKC	\N	2026-08-28 19:47:56.982	2026-08-28 19:47:56.982	2026-09-27 19:47:56.978
cmtdd63zj00acv3xw5dnjtyb2	Em6HEehTPVyB-wdweslb1lTL1j30muYP	\N	2026-08-28 19:47:58.255	2026-08-28 19:47:58.255	2026-09-27 19:47:58.252
cmtdd642d00agv3xwjoyo6wzq	bm7XjjLNPnQmJzEyUzQaGlyLYsTBVR3u	\N	2026-08-28 19:47:58.357	2026-08-28 19:47:58.357	2026-09-27 19:47:58.353
cmtdd649t00b1v3xwvgit2wrp	fGnWkKktGI4mMkXRk6tCMJ8fPsE_V-1w	\N	2026-08-28 19:47:58.625	2026-08-28 19:47:58.625	2026-09-27 19:47:58.622
cmtdd64dq00b7v3xw0ccrv18k	LnoDWj5tH4un9_AA_uUOaW2zUkUF11n2	\N	2026-08-28 19:47:58.766	2026-08-28 19:47:58.766	2026-09-27 19:47:58.762
cmtdd65wq00crv3xwyxwgj2t7	9DgPWKZ4cAoWXV3HBTcnQ0GhgO-9k8AB	\N	2026-08-28 19:48:00.747	2026-08-28 19:48:00.747	2026-09-27 19:48:00.743
cmtdd674u00dlv3xw696upecr	3koE9OxCbmcotRRgxy7ZJtC5AanI4IFM	\N	2026-08-28 19:48:02.334	2026-08-28 19:48:02.334	2026-09-27 19:48:02.33
cmtdd67f500e5v3xwnsfed99b	SyN01qQJgTX92rtjlVt5xBsm-wV3rjFt	\N	2026-08-28 19:48:02.705	2026-08-28 19:48:02.705	2026-09-27 19:48:02.698
cmtdd67l200emv3xw4ezqc2ew	GJXPZWddFfMH9xxVBUUDzpx3uPyy2Qkz	\N	2026-08-28 19:48:02.919	2026-08-28 19:48:02.919	2026-09-27 19:48:02.915
cmtdd688f00frv3xw11pkbo88	nmQRGL4PIDrta8J9ad93o3_fkVWjkkuw	\N	2026-08-28 19:48:03.759	2026-08-28 19:48:03.759	2026-09-27 19:48:03.755
cmtdd68fp00ggv3xw2wtyf52t	6VVlIV-bjrX1xgrurf_-RHjCCSoDd6aI	\N	2026-08-28 19:48:04.021	2026-08-28 19:48:04.021	2026-09-27 19:48:04.018
cmtdd6l0o00h0v3xwi3p0bsvf	0GT6u3FMzEBNqHlro8tTvtXN2ce0P_Td	\N	2026-08-28 19:48:20.328	2026-08-28 19:48:20.328	2026-09-27 19:48:20.31
cmtdd6m2x00hiv3xw630g6bq0	FwlvKxJ2WYNAc4uYePThPXK8FP7lsLJJ	\N	2026-08-28 19:48:21.705	2026-08-28 19:48:21.705	2026-09-27 19:48:21.701
cmtdd6ogu00hyv3xwprzplber	B-NnHqCap2m5BPy4R2qEr6Kgl6hlNzqQ	\N	2026-08-28 19:48:24.798	2026-08-28 19:48:24.798	2026-09-27 19:48:24.788
cmtdd6ul300j4v3xwkw41pja3	TS0zMUBJItr73XTUeGY7IzlyoMyXQokv	\N	2026-08-28 19:48:32.727	2026-08-28 19:48:32.727	2026-09-27 19:48:32.723
cmtdd6uz500jmv3xwf2js8wtf	cUCI-9gXR9fpxKwofXXEh8-OJNCbDkpr	\N	2026-08-28 19:48:33.233	2026-08-28 19:48:33.233	2026-09-27 19:48:33.23
cmtdd76w400k6v3xw9prxz6rd	BTgEPcIXI5haj3goiG92WDBfWTBDzQ8T	\N	2026-08-28 19:48:48.677	2026-08-28 19:48:48.677	2026-09-27 19:48:48.669
cmtdd76xz00k8v3xw9l7rzaiw	Qgzk32KUHrUu_u3y8gbUpMPE75w3Ac2N	\N	2026-08-28 19:48:48.744	2026-08-28 19:48:48.744	2026-09-27 19:48:48.737
cmtdd772y00kcv3xwubdguiqu	DUW1NbcN7VcBhfCtAZ_Q0k2BD4TQ3NBg	\N	2026-08-28 19:48:48.922	2026-08-28 19:48:48.922	2026-09-27 19:48:48.919
cmtdd778000kgv3xwttb94wuc	Sb9Pw_26qe-YW1ZmfUPr9QOkvfiEl9uR	\N	2026-08-28 19:48:49.104	2026-08-28 19:48:49.104	2026-09-27 19:48:49.099
cmtdd779g00kiv3xw5c0dladh	hHbfAQJhp3dd6ISxiIinhV6ng2I1Ohnv	\N	2026-08-28 19:48:49.157	2026-08-28 19:48:49.157	2026-09-27 19:48:49.152
cmtdd79z900ksv3xwnk5a0go7	-_V1clvuhPpj55x8CFNUDDQmUmvNh-TR	\N	2026-08-28 19:48:52.677	2026-08-28 19:48:52.677	2026-09-27 19:48:52.674
cmtdd7a6p00kuv3xwshc3cirx	LE4xtVUhn-QLEiiSwOj4PesWknAHfTxq	\N	2026-08-28 19:48:52.945	2026-08-28 19:48:52.945	2026-09-27 19:48:52.941
cmtdd7ag900kyv3xwa9m1on6d	xQKy9be5SsJu27KDdYZV_J6pV9tt955a	\N	2026-08-28 19:48:53.289	2026-08-28 19:48:53.289	2026-09-27 19:48:53.286
cmtdd7aka00l0v3xwhapc0pd8	t83LpHDJAUg3kJ5SU4tEC23mB4UwIFEi	\N	2026-08-28 19:48:53.435	2026-08-28 19:48:53.435	2026-09-27 19:48:53.431
cmtdd7ax600l4v3xwtzwccg8x	sUpaXQMjtfZpoJZhNjGToU7mtICudl05	\N	2026-08-28 19:48:53.898	2026-08-28 19:48:53.898	2026-09-27 19:48:53.894
cmtdd7b5100l8v3xwugqmv32b	eefXcNcrHtuNzKllC8w3ry-F7DOncY6U	\N	2026-08-28 19:48:54.181	2026-08-28 19:48:54.181	2026-09-27 19:48:54.166
cmtdd7bdb00lcv3xwbpah7ige	Cfra7quxc2qTWEMFcACjywtd6B7jYspE	\N	2026-08-28 19:48:54.479	2026-08-28 19:48:54.479	2026-09-27 19:48:54.475
cmtdd7bev00lev3xw6z325je3	yl-84DZwq6abEeBv2YUVPr16cMn6lHp_	\N	2026-08-28 19:48:54.536	2026-08-28 19:48:54.536	2026-09-27 19:48:54.533
cmtdd7bhs00liv3xw0ab1t4iq	-cOeqwv-U00twmqiyF9b1Zxq4-c7GyuY	\N	2026-08-28 19:48:54.64	2026-08-28 19:48:54.64	2026-09-27 19:48:54.636
cmtdd7bld00lmv3xwlfz45tnh	AYSWYfXQqVGMO9sI0adzYYWZaFLubTXr	\N	2026-08-28 19:48:54.77	2026-08-28 19:48:54.77	2026-09-27 19:48:54.765
cmtel4y0s0003v32sy8n6vy34	49SzyBuQ7Mw4gnPDBUOfjPGyrEnn9e_e	\N	2026-08-29 16:18:46.972	2026-08-29 16:18:46.972	2026-09-28 16:18:46.968
cmtel4y7k000jv32s7wolvbbg	3U5T1VOwqWl3-7iPfh7NelsYf4jdphxi	\N	2026-08-29 16:18:47.217	2026-08-29 16:18:47.217	2026-09-28 16:18:47.214
cmtel4ya1000zv32sgub0ie0b	inSoq3nwwgM7FBxRT7LllSuWiOiaUuZQ	\N	2026-08-29 16:18:47.306	2026-08-29 16:18:47.306	2026-09-28 16:18:47.303
cmtel4ycb001fv32s7vw2knoe	M96bAyKNMr7H8zfxC6V4PGPg67Xa2Hzh	\N	2026-08-29 16:18:47.387	2026-08-29 16:18:47.387	2026-09-28 16:18:47.385
cmtel4yep001vv32sj6or8zwn	ifH550PEgzMqPc9m5a0tp4Miif93ZE9H	\N	2026-08-29 16:18:47.473	2026-08-29 16:18:47.473	2026-09-28 16:18:47.47
cmtel4yh3002bv32slbh0ab1y	NAWSlCH30d8kxfGvLMXKqO8yY__SxFiZ	\N	2026-08-29 16:18:47.56	2026-08-29 16:18:47.56	2026-09-28 16:18:47.557
cmtel4yph002rv32sqhlvzoqz	q7lGm7Pin-Ns_DSbjy6PIq0AZrybq3j5	\N	2026-08-29 16:18:47.861	2026-08-29 16:18:47.861	2026-09-28 16:18:47.858
cmtel4ys90037v32staz81az2	HZxMpOheHvhPriiUBqo3IMOoSDFsYdxM	\N	2026-08-29 16:18:47.962	2026-08-29 16:18:47.962	2026-09-28 16:18:47.959
cmtel4yuh003nv32s7ji3fs34	gMlOsXXdGMR4B21eUzh8j5SDG3JOrySu	\N	2026-08-29 16:18:48.042	2026-08-29 16:18:48.042	2026-09-28 16:18:48.039
cmtel4ywl0043v32s3tdlhz88	nDGIe8rXWmUjBeQ3hei1LwIqZCqzWD7i	\N	2026-08-29 16:18:48.118	2026-08-29 16:18:48.118	2026-09-28 16:18:48.115
cmtel4yy30047v32sjw7lrjk1	Yi4XC-IYD9rjhwJsVyGR0NDWBz1H-r5g	\N	2026-08-29 16:18:48.171	2026-08-29 16:18:48.171	2026-09-28 16:18:48.169
cmtel4yzc004bv32syru8qjeq	Eyv4bOBMxX7o-Qm1Go4Grjr_EmEsvQwE	\N	2026-08-29 16:18:48.217	2026-08-29 16:18:48.217	2026-09-28 16:18:48.214
cmtel4z0p004fv32sycs9bybc	SC1NQKauK2rs-vwE0wROPC5v3EEGEI3C	\N	2026-08-29 16:18:48.266	2026-08-29 16:18:48.266	2026-09-28 16:18:48.263
cmtel4z1h004jv32s8nrr3zxc	2NOJ8bCnfu_tULdabcAH52xkO-89N2HX	\N	2026-08-29 16:18:48.293	2026-08-29 16:18:48.293	2026-09-28 16:18:48.29
cmtel4z28004nv32sgwoy7wsu	6famrFGV80EFNrnD4MFTbqvLT7gvcVRr	\N	2026-08-29 16:18:48.32	2026-08-29 16:18:48.32	2026-09-28 16:18:48.318
cmtel4z31004rv32s4ekb2q5t	9UpXFKcs_2owNg03m1BtjMPe4Gc4_-wO	\N	2026-08-29 16:18:48.349	2026-08-29 16:18:48.349	2026-09-28 16:18:48.347
cmtel4z3u004vv32snrwhz22j	3z9M8JYuvhukx1MZHNdAveNkN5aDw3ji	\N	2026-08-29 16:18:48.378	2026-08-29 16:18:48.378	2026-09-28 16:18:48.376
cmtel4z4r004zv32s8ytqbv8a	LPk5zueB7Xga1Kj82tFwUBvKrdsBXNlm	\N	2026-08-29 16:18:48.412	2026-08-29 16:18:48.412	2026-09-28 16:18:48.409
cmtel4zky0073v32s2td6puud	oLC0AMzxlCYxuuPRKUb1HkAvi97i8GC3	\N	2026-08-29 16:18:48.994	2026-08-29 16:18:48.994	2026-09-28 16:18:48.992
cmtel4zly0077v32sgkn93olh	NF66qCYSNQxY7VUTLegzWPrVtHdTL_yL	\N	2026-08-29 16:18:49.03	2026-08-29 16:18:49.03	2026-09-28 16:18:49.028
cmtel4zpi007sv32scy0hz2he	GZsix21sM-qKGuOF856bTKru_biW5FJX	\N	2026-08-29 16:18:49.158	2026-08-29 16:18:49.158	2026-09-28 16:18:49.155
cmtel4zrn007yv32s6ws1glgo	G1QrLb624zl-HPcEFvdKMgREQDPM5UYl	\N	2026-08-29 16:18:49.235	2026-08-29 16:18:49.235	2026-09-28 16:18:49.233
cmtel50jc009iv32s6c45gg1f	RA5EURDjjADiC0S5JWj5BqN-rIF2IPe9	\N	2026-08-29 16:18:50.232	2026-08-29 16:18:50.232	2026-09-28 16:18:50.229
cmtel515v00a4v32sjws1gwbq	iwDjTEeH3-i-m3cqn8N7Vc_8JBM1Q-ux	\N	2026-08-29 16:18:51.044	2026-08-29 16:18:51.044	2026-09-28 16:18:51.041
cmtel51ab00aov32szb7laey6	xsUkhNvPOz2QVoOW1v6LSEYxLsGdCQve	\N	2026-08-29 16:18:51.203	2026-08-29 16:18:51.203	2026-09-28 16:18:51.2
cmtel51cp00b5v32s5dhm9nh9	iNtyaG2vsG5oPHPtjKqx8bNB4kXWKOkJ	\N	2026-08-29 16:18:51.289	2026-08-29 16:18:51.289	2026-09-28 16:18:51.286
cmtel51ne00cav32sct2fxivr	nWYdseAvxg_ONI6W3mK-b8XIwiFAG0Ql	\N	2026-08-29 16:18:51.674	2026-08-29 16:18:51.674	2026-09-28 16:18:51.672
cmtel51rz00d3v32sn6r404ev	D-M00dzw2B-IdBJGNdR2cfIq-B6tqqV7	\N	2026-08-29 16:18:51.839	2026-08-29 16:18:51.839	2026-09-28 16:18:51.836
cmtel55sr00drv32s3vt3uzk2	i402SVKfTFtZ35-1u6TUBcCRHB6JXAJU	\N	2026-08-29 16:18:57.051	2026-08-29 16:18:57.051	2026-09-28 16:18:57.049
cmtel55tc00dtv32safuujhqf	YjRa9oOvyqkjo4vFaWjHpMzmNuJJGqiP	\N	2026-08-29 16:18:57.073	2026-08-29 16:18:57.073	2026-09-28 16:18:57.07
cmtel55uz00dxv32stk5mhc60	IGoy_4zqP-3OFlcEqYmycHsvJI8hJ4n9	\N	2026-08-29 16:18:57.132	2026-08-29 16:18:57.132	2026-09-28 16:18:57.129
cmtel55ww00e1v32sojcapuzu	PaHc14Nq8p5qrNcQkQJPcTICv2xKRyaX	\N	2026-08-29 16:18:57.201	2026-08-29 16:18:57.201	2026-09-28 16:18:57.198
cmtel55xe00e3v32sluya68c2	fGIyUe53qcXMpYz-f44VuCccv9-hYPwe	\N	2026-08-29 16:18:57.218	2026-08-29 16:18:57.218	2026-09-28 16:18:57.216
cmtel56uu00edv32sy4qqrc79	hQsBrw-6-Vivu4YSH_46pRvElL7pGXAK	\N	2026-08-29 16:18:58.423	2026-08-29 16:18:58.423	2026-09-28 16:18:58.42
cmtel56xw00efv32s5dsj3f9p	ex6mi15KhYHcxykUYe5y-z62P-IcR4Z4	\N	2026-08-29 16:18:58.532	2026-08-29 16:18:58.532	2026-09-28 16:18:58.529
cmtel571000ejv32si4q67zk2	omzn2CPLTybZL6cIcTlAzfhy7136TwNf	\N	2026-08-29 16:18:58.644	2026-08-29 16:18:58.644	2026-09-28 16:18:58.642
cmtel572800elv32sh1dm42l7	s1EDR9SwLbmdhaTx8hZHEg39cYdxgccx	\N	2026-08-29 16:18:58.689	2026-08-29 16:18:58.689	2026-09-28 16:18:58.686
cmtel576k00epv32se8by7f8g	yYT5EZnaNfYINLy_f27mGLmG5K2THkxA	\N	2026-08-29 16:18:58.844	2026-08-29 16:18:58.844	2026-09-28 16:18:58.842
cmtel578200etv32sldhdswjj	XpM7eyocOtueuN4D5wUu42eBg9oA_5Ku	\N	2026-08-29 16:18:58.898	2026-08-29 16:18:58.898	2026-09-28 16:18:58.895
cmtel579j00exv32sxzq780rk	NRGlK0or4DbRVVHOTH09nId_4s7SDMOX	\N	2026-08-29 16:18:58.951	2026-08-29 16:18:58.951	2026-09-28 16:18:58.949
cmtel57a700ezv32s78ty7a3t	1FhSqYTRxcKYdBfuGzruFqbSMLUPuOQT	\N	2026-08-29 16:18:58.975	2026-08-29 16:18:58.975	2026-09-28 16:18:58.972
cmtel57bk00f3v32sf088krcv	qMBAiUFcifqNJNnUfn9hy3Dgqjq1u_c7	\N	2026-08-29 16:18:59.025	2026-08-29 16:18:59.025	2026-09-28 16:18:59.022
cmtel57cy00f7v32s8e2kpfg5	RtQMtW1rclneEZPN62WP8zMJswz9Vqyc	\N	2026-08-29 16:18:59.075	2026-08-29 16:18:59.075	2026-09-28 16:18:59.072
cmtel5hwi00gyv32s4dccl7dc	wHtT7bnSxZpnclU_PJI8_FBcwToOvrv0	\N	2026-08-29 16:19:12.739	2026-08-29 16:19:12.739	2026-09-28 16:19:12.736
cmtel5i1n00hgv32sr9pubuau	5j4ixR0CRAfNvIhq52v1C6l0X2ndl_OT	\N	2026-08-29 16:19:12.924	2026-08-29 16:19:12.924	2026-09-28 16:19:12.921
cmtel5i7u00hwv32s4f9b5pqu	0fZKJsWsJgEHSSJRFrTJ2LbffT9bXK2h	\N	2026-08-29 16:19:13.147	2026-08-29 16:19:13.147	2026-09-28 16:19:13.144
cmtel5jpn00j2v32sfgmjs8bt	GN9FnrdbTprFFBhHI9kkRRqiRgJjL4OL	\N	2026-08-29 16:19:15.083	2026-08-29 16:19:15.083	2026-09-28 16:19:15.081
cmtel5jwy00jkv32s2wdhsn6d	XUeM2vB6a1WavgexvhYEYdWyB2Jzbui5	\N	2026-08-29 16:19:15.346	2026-08-29 16:19:15.346	2026-09-28 16:19:15.343
cmtel5nlf00kqv32s80snlrl0	gLlA6Acpelaz2Kkywa0qWnbePuw41Yjp	\N	2026-08-29 16:19:20.116	2026-08-29 16:19:20.116	2026-09-28 16:19:20.113
cmtel6nuc0003v3mc08xrd4x0	XJm-cU2bLp_XplcyRuP1GIhBU0_TQMQb	\N	2026-08-29 16:20:07.092	2026-08-29 16:20:07.092	2026-09-28 16:20:07.085
cmtel6o1n000lv3mcjgzgro29	EDTUh_Fz-YVyw0fXjmwMt6H1Fq0q6VXn	\N	2026-08-29 16:20:07.356	2026-08-29 16:20:07.356	2026-09-28 16:20:07.349
cmtel6o8r0011v3mcb6mo34xc	dEjIoHXpWk2Bp06GVP_8AZmUt3939h2y	\N	2026-08-29 16:20:07.612	2026-08-29 16:20:07.612	2026-09-28 16:20:07.605
cmtel6pv30027v3mc0gr6hh7l	BqYjfV6kMp1nZjZ8-X6X0MO8ic6i3MIG	\N	2026-08-29 16:20:09.711	2026-08-29 16:20:09.711	2026-09-28 16:20:09.704
cmtel6q2m002pv3mc5p8h0g5l	sOlAYWWcsdosL_fxUrl0c3W2iC9FO2X7	\N	2026-08-29 16:20:09.982	2026-08-29 16:20:09.982	2026-09-28 16:20:09.975
cmtel6tar0039v3mcd91ix2j1	7ISQvIMie8wYqkCSmCotN0-LMc9N8Neo	\N	2026-08-29 16:20:14.163	2026-08-29 16:20:14.163	2026-09-28 16:20:14.156
cmtel6ter003pv3mcl0rqgy0j	6AzmDBfraehtKoihivCFckRYDYdzIJYS	\N	2026-08-29 16:20:14.307	2026-08-29 16:20:14.307	2026-09-28 16:20:14.3
cmtel6th80045v3mcyyxpxz6a	6VwKExXHbPTB8saP3LbBXx5FIJM5bKgk	\N	2026-08-29 16:20:14.396	2026-08-29 16:20:14.396	2026-09-28 16:20:14.389
cmtel6tjq004lv3mc0xac1w5y	llzYqaOzLoxs5A1HR2qqgxSf_LMKJkHg	\N	2026-08-29 16:20:14.486	2026-08-29 16:20:14.486	2026-09-28 16:20:14.479
cmtel6tmb0051v3mccjbtns0d	f7mR8r1AtiJP7niNSlBY6AD3cV--YlT2	\N	2026-08-29 16:20:14.579	2026-08-29 16:20:14.579	2026-09-28 16:20:14.572
cmtel6toq005hv3mc6hm53zav	eACID_Y7uZP8LysbUtcvvUmfVuKNToq6	\N	2026-08-29 16:20:14.666	2026-08-29 16:20:14.666	2026-09-28 16:20:14.659
cmtel6trg005xv3mc4931nh0z	oatIKUs5HQj0o5ummNB9E4JlI9b0XR1j	\N	2026-08-29 16:20:14.764	2026-08-29 16:20:14.764	2026-09-28 16:20:14.757
cmtel6tu2006dv3mcxhl9mdpa	AcbYe1gvRirtbHlRrsjgn1I2Kk4WwIwB	\N	2026-08-29 16:20:14.859	2026-08-29 16:20:14.859	2026-09-28 16:20:14.852
cmtel6twa006tv3mclt8o9g1g	Ytb6gX-pEZkgxDH4RjF0WDoNsK7o-4QG	\N	2026-08-29 16:20:14.938	2026-08-29 16:20:14.938	2026-09-28 16:20:14.931
cmtel6tyl0079v3mc3kobofra	hX2_MIUa664X2AM55hYLG_UCxHqs_J4k	\N	2026-08-29 16:20:15.021	2026-08-29 16:20:15.021	2026-09-28 16:20:15.014
cmtel6u04007dv3mc8elglg31	bKL2lHRNxpeEQpdTwgfwABcJ6RTHD91b	\N	2026-08-29 16:20:15.076	2026-08-29 16:20:15.076	2026-09-28 16:20:15.07
cmtel6u1h007hv3mcbmxfhxu8	cekMohxg6Uu4Z-P3eXRaSohFhmJrUJrY	\N	2026-08-29 16:20:15.126	2026-08-29 16:20:15.126	2026-09-28 16:20:15.119
cmtel6u2z007lv3mclcfrsmqb	cAKUMEOGjpaEcoTl0O6F59C8dAM1d1M9	\N	2026-08-29 16:20:15.18	2026-08-29 16:20:15.18	2026-09-28 16:20:15.173
cmtel6u3s007pv3mcjm9lhhip	n4Pu0c82-RrgCWpPl34Fjh1WNnrube7Y	\N	2026-08-29 16:20:15.209	2026-08-29 16:20:15.209	2026-09-28 16:20:15.202
cmtel6u4n007tv3mcrkl005ca	NqDFC9HB4tM8xg9u2YO3I96WXat_PGTQ	\N	2026-08-29 16:20:15.24	2026-08-29 16:20:15.24	2026-09-28 16:20:15.233
cmtel6u5h007xv3mcm6ww8us8	6a99Ja4WeVw9qllLY1OBtN4Ab2Gqdnhv	\N	2026-08-29 16:20:15.269	2026-08-29 16:20:15.269	2026-09-28 16:20:15.262
cmtel6u670081v3mc90evelgf	h5jljj8GWfTjWkhtbp-1eUGKgHvoeCAQ	\N	2026-08-29 16:20:15.296	2026-08-29 16:20:15.296	2026-09-28 16:20:15.289
cmtel6u740085v3mcsps88wxn	8CwER2R_EIGg8-ie5XEtDE3n96e_OCSw	\N	2026-08-29 16:20:15.329	2026-08-29 16:20:15.329	2026-09-28 16:20:15.321
cmtel6utl00a9v3mcrwknal37	WEzhcNGlC0wyMe4VTTuTVaHcewy0AbIr	\N	2026-08-29 16:20:16.137	2026-08-29 16:20:16.137	2026-09-28 16:20:16.13
cmtel6uuw00adv3mc2jyfbdmy	xFeEMfGQsKi4XbCCwKNTAHXAmF9vsEko	\N	2026-08-29 16:20:16.184	2026-08-29 16:20:16.184	2026-09-28 16:20:16.176
cmtel6uys00ayv3mcwwkt4yih	5C-pyYqpCtkuaHQ7OsUGl3RQ8Fm0vU8T	\N	2026-08-29 16:20:16.324	2026-08-29 16:20:16.324	2026-09-28 16:20:16.317
cmtel6v1h00b4v3mcbwvlfc9l	YH15UVw7nJxAaKygFlqLboiYPpb-blAs	\N	2026-08-29 16:20:16.421	2026-08-29 16:20:16.421	2026-09-28 16:20:16.414
cmtel6vov00cov3mcojm1kh09	W8jjY-3c2dn6fd0byO4tOJD3V74Hlpto	\N	2026-08-29 16:20:17.263	2026-08-29 16:20:17.263	2026-09-28 16:20:17.256
cmtel6wd100dav3mcmmg615c2	GkpggZHExceOj-_qEmyJ5dkf2Hzw69mw	\N	2026-08-29 16:20:18.133	2026-08-29 16:20:18.133	2026-09-28 16:20:18.125
cmtel6wj300e2v3mcylb6ttm7	4bKCGymu1e_nkHTjCLX-7u_GQIpL4Ikp	\N	2026-08-29 16:20:18.351	2026-08-29 16:20:18.351	2026-09-28 16:20:18.344
cmtel6wly00ejv3mc4j4apvxe	rBTJseiA1AhJBqOi1UG4rO71VnKMyjXw	\N	2026-08-29 16:20:18.454	2026-08-29 16:20:18.454	2026-09-28 16:20:18.447
cmtel6wwh00fov3mcvilqxpvk	A8zyrqifl-KMuPSFPXSwURMr_uUdIch4	\N	2026-08-29 16:20:18.834	2026-08-29 16:20:18.834	2026-09-28 16:20:18.826
cmtel6x1500gdv3mc0y53d6tp	Wdlrtp-nf70XVWuW9cnB4WlVGdnMfi4w	\N	2026-08-29 16:20:19.002	2026-08-29 16:20:19.002	2026-09-28 16:20:18.995
cmtel6zzv00gxv3mctfcsewax	sIDpbySq-KF3BcL3K0hESqhcl_TPpKwe	\N	2026-08-29 16:20:22.843	2026-08-29 16:20:22.843	2026-09-28 16:20:22.836
cmtel700g00gzv3mcay6o0jl2	8z2SB14b_TfZOfv7ffeM_K7sHvp7CaFr	\N	2026-08-29 16:20:22.864	2026-08-29 16:20:22.864	2026-09-28 16:20:22.857
cmtel702400h3v3mc9xoad6hv	JrsC53Ngknu5OeIspYqkD_5fb2n032iU	\N	2026-08-29 16:20:22.925	2026-08-29 16:20:22.925	2026-09-28 16:20:22.918
cmtel703z00h7v3mcj9buxo8y	oNidqbTtWi1cMXVGklc8DQbo4GWuEwJR	\N	2026-08-29 16:20:22.992	2026-08-29 16:20:22.992	2026-09-28 16:20:22.984
cmtel704i00h9v3mc96bojt7h	WrnsMYViRhx2NT4AAz34xpZrQ525As1z	\N	2026-08-29 16:20:23.01	2026-08-29 16:20:23.01	2026-09-28 16:20:23.003
cmtel715n00hjv3mca9igiht3	Qm7kyDGuAk9Y10eknhgd0X4S6LgPAigh	\N	2026-08-29 16:20:24.347	2026-08-29 16:20:24.347	2026-09-28 16:20:24.34
cmtel718k00hlv3mckbxec2tn	UABKNb0osOiOEnmfLYK_A_JxVzee4avZ	\N	2026-08-29 16:20:24.453	2026-08-29 16:20:24.453	2026-09-28 16:20:24.446
cmtel71bh00hpv3mcyaor7g93	lkr3WMPzM5UMkQEQWdERQXrtze2Npy0i	\N	2026-08-29 16:20:24.557	2026-08-29 16:20:24.557	2026-09-28 16:20:24.55
cmtel71ct00hrv3mc3lkuld3n	dNanX_xLxyBO4AgUz_6bCYV7deQprdqd	\N	2026-08-29 16:20:24.606	2026-08-29 16:20:24.606	2026-09-28 16:20:24.599
cmtel71gt00hvv3mc9g92yiu9	zrW5Mc7s1F3Tc3jYlV77iczHLd-sMN3A	\N	2026-08-29 16:20:24.749	2026-08-29 16:20:24.749	2026-09-28 16:20:24.742
cmtel71i500hzv3mcsj144w9z	gRicoZnR2daqwZCAkSBMUWvF2MixxBi9	\N	2026-08-29 16:20:24.798	2026-08-29 16:20:24.798	2026-09-28 16:20:24.79
cmtel71k200i3v3mcl6fntaof	BKPPuAIVewPPgkQ4VNMWNu9OSrn7_Gpl	\N	2026-08-29 16:20:24.867	2026-08-29 16:20:24.867	2026-09-28 16:20:24.859
cmtel71kt00i5v3mceb9zucvc	DmMTTpFLd3WlUA5Ll5ZN_guU1o6Bch1s	\N	2026-08-29 16:20:24.893	2026-08-29 16:20:24.893	2026-09-28 16:20:24.886
cmtel71m700i9v3mciwlu2q5d	RcCT676IU9Pcc9ml8UykHwuYTUik6tTW	\N	2026-08-29 16:20:24.943	2026-08-29 16:20:24.943	2026-09-28 16:20:24.936
cmtel71np00idv3mc9e2vvbn4	uWmyUpSRux8y-ZKbBw_AO0gamuPITgmk	\N	2026-08-29 16:20:24.997	2026-08-29 16:20:24.997	2026-09-28 16:20:24.99
cmtel7az900kcv3mcq4z4new0	SKRNLDc1h7nMURMOm3V2ED-AJ0KU2BD-	\N	2026-08-29 16:20:37.077	2026-08-29 16:20:37.077	2026-09-28 16:20:37.07
cmtel8uoh0003v330hb4kh0cp	6owvKpJ1MI2TuUJqca_wqozS6rpjwBcH	\N	2026-08-29 16:21:49.265	2026-08-29 16:21:49.265	2026-09-28 16:21:49.253
cmtel8uvk000lv330zf0hm8w9	_NkuNsmUOeO4VMPXxztQf_6DgnQQ0A1E	\N	2026-08-29 16:21:49.52	2026-08-29 16:21:49.52	2026-09-28 16:21:49.509
cmtel8v2a0011v330o12gxaf3	LDhtraIvyF_kYfy0xTTmnTThB7IhYvzt	\N	2026-08-29 16:21:49.762	2026-08-29 16:21:49.762	2026-09-28 16:21:49.751
cmtel8wmz0027v330phaec86d	HUHxrixJ9_zeUP8s_kh5DYP_Stb85mIG	\N	2026-08-29 16:21:51.803	2026-08-29 16:21:51.803	2026-09-28 16:21:51.792
cmtel8wue002pv3307gmxm611	1pfzmLe-S7vhd24TcKaI8zaLtPGF_Heu	\N	2026-08-29 16:21:52.07	2026-08-29 16:21:52.07	2026-09-28 16:21:52.059
cmtel8zjg0037v330vcbcbvzr	pmD3nkdrqWgQ6pO7WvZ1OBsOndRMZegE	\N	2026-08-29 16:21:55.564	2026-08-29 16:21:55.564	2026-09-28 16:21:55.553
cmtel8zn1003nv330zs5rfski	a0yenyUEcED1h51xT3B4PMOZ5D8RKNuJ	\N	2026-08-29 16:21:55.693	2026-08-29 16:21:55.693	2026-09-28 16:21:55.682
cmtel8zpp0043v330r26480xz	Oz6X5pxVo0MFErb2QYzu-GmFcT8afUam	\N	2026-08-29 16:21:55.789	2026-08-29 16:21:55.789	2026-09-28 16:21:55.778
cmtel8zs6004jv3303obbtmgw	wBeppIj3modfgMkqkC1YZNNtbTDkAbxA	\N	2026-08-29 16:21:55.879	2026-08-29 16:21:55.879	2026-09-28 16:21:55.868
cmtel8zuv004zv3305psukgn8	KKkvCnob5zNNWCdzFTDDvFRmgeEsA4zt	\N	2026-08-29 16:21:55.975	2026-08-29 16:21:55.975	2026-09-28 16:21:55.964
cmtel8zx9005fv3300x8iemw5	MUQW-E_eraJscx95UhiWSgoEWrPlHVgr	\N	2026-08-29 16:21:56.062	2026-08-29 16:21:56.062	2026-09-28 16:21:56.05
cmtel8zzt005vv330zah5ibg0	3Pg9URFr5cqTOQqiCx7PRcl8MYQoUDPu	\N	2026-08-29 16:21:56.153	2026-08-29 16:21:56.153	2026-09-28 16:21:56.142
cmtel9023006bv330ttz0e8un	L3l7DiAuQIu_0ektbw9FiKf9VKH0h462	\N	2026-08-29 16:21:56.236	2026-08-29 16:21:56.236	2026-09-28 16:21:56.225
cmtel904g006rv330we6swqxc	kM9DU690RXdTI8J-vaaJRTSXBWQxZkHb	\N	2026-08-29 16:21:56.32	2026-08-29 16:21:56.32	2026-09-28 16:21:56.309
cmtel907k0077v330bja5xbet	Rr5YjM1xNwQLPFDYApWGwKQrN7BbL4ss	\N	2026-08-29 16:21:56.433	2026-08-29 16:21:56.433	2026-09-28 16:21:56.422
cmtel909f007bv330ovnivf54	pFs4MGGqg8OsPMk_iRk6BWZyJjHLof9G	\N	2026-08-29 16:21:56.499	2026-08-29 16:21:56.499	2026-09-28 16:21:56.488
cmtel90as007fv33025j76hz5	tKYICeBa08DhxTtaIk_zMuQrXFx-mX_f	\N	2026-08-29 16:21:56.548	2026-08-29 16:21:56.548	2026-09-28 16:21:56.537
cmtel90c9007jv330w0t7y3it	NyWG0wEawfi7WZs2dxl5HWmWMFoQ-ynH	\N	2026-08-29 16:21:56.602	2026-08-29 16:21:56.602	2026-09-28 16:21:56.591
cmtel90d9007nv330rieqqhqo	N5EdUpwGdyhXss78DTAoIz6rdQJ1mrYI	\N	2026-08-29 16:21:56.637	2026-08-29 16:21:56.637	2026-09-28 16:21:56.626
cmtel90e6007rv330geztrtl4	8JYgHO8gdgIYDPVfSFBnlHkEoBEXVwPP	\N	2026-08-29 16:21:56.671	2026-08-29 16:21:56.671	2026-09-28 16:21:56.66
cmtel90fi007vv330v0sm19pc	TPsQG4_f3Pioew6tHbCPCd--5KEiMTId	\N	2026-08-29 16:21:56.719	2026-08-29 16:21:56.719	2026-09-28 16:21:56.708
cmtel90gu007zv330ngxzjdj8	W50Gr8nPxcaksFqTMRapsqGsBPCUtYSN	\N	2026-08-29 16:21:56.766	2026-08-29 16:21:56.766	2026-09-28 16:21:56.755
cmtel90i80083v330r8fpcw5i	cpBoNbIbDDqVw3MWwA8QPwP_DAYcwU8j	\N	2026-08-29 16:21:56.816	2026-08-29 16:21:56.816	2026-09-28 16:21:56.805
cmtel912m00a7v3303dor6t42	8VLkMtS9Voa1Zn2t6fEYPSeRpChzjuvl	\N	2026-08-29 16:21:57.551	2026-08-29 16:21:57.551	2026-09-28 16:21:57.54
cmtel913r00abv330petk8j7a	HhFNynqu9zNHXVPu1j5llUedYYqPrc27	\N	2026-08-29 16:21:57.591	2026-08-29 16:21:57.591	2026-09-28 16:21:57.58
cmtel917k00awv330ormgfskh	78k5aCgpA0hasEjIPn1Pp8SrbxsxU-4q	\N	2026-08-29 16:21:57.729	2026-08-29 16:21:57.729	2026-09-28 16:21:57.718
cmtel919o00b2v330rmfwnyvy	bdhqa3A_uHwNjFKps2jgdU3xXV8TjdLl	\N	2026-08-29 16:21:57.804	2026-08-29 16:21:57.804	2026-09-28 16:21:57.793
cmtel91xb00cmv330wpil508m	1eStyWRS7ZYqh1rRyk_H1JKz_J50rn9P	\N	2026-08-29 16:21:58.656	2026-08-29 16:21:58.656	2026-09-28 16:21:58.645
cmtel92iw00dcv330lf0crdfn	YH_wDnruNnct3FfGu3D6ei5wvPElNcYu	\N	2026-08-29 16:21:59.432	2026-08-29 16:21:59.432	2026-09-28 16:21:59.421
cmtel92mz00dwv330hyqh21bq	HsRBF7B7wwd0tAxXaSHyus-6nxox9qjd	\N	2026-08-29 16:21:59.579	2026-08-29 16:21:59.579	2026-09-28 16:21:59.569
cmtel92pi00edv330vmszh9mm	xBQHE9dpuht4KvAwExaoLwNF6Jo3YWgz	\N	2026-08-29 16:21:59.67	2026-08-29 16:21:59.67	2026-09-28 16:21:59.659
cmtel92yt00fiv3308un5yljb	ybrt3kNX-f_j4v6kJfcVnGRhjqvrhqLS	\N	2026-08-29 16:22:00.005	2026-08-29 16:22:00.005	2026-09-28 16:21:59.994
cmtel932y00g7v330wsp1qg96	8THFy6TLiIuk7dYdxYrqchTRMRaNoaIp	\N	2026-08-29 16:22:00.154	2026-08-29 16:22:00.154	2026-09-28 16:22:00.143
cmtel983u00hhv330y7nsrr5i	0guTHIzw4_lrZVTpR6ngauS4CsqBmmAZ	\N	2026-08-29 16:22:06.667	2026-08-29 16:22:06.667	2026-09-28 16:22:06.656
cmtel9hba00k4v330khoiqfws	Mpv74thPIUnkwEQpVFpv8BYoVGqPujfm	\N	2026-08-29 16:22:18.598	2026-08-29 16:22:18.598	2026-09-28 16:22:18.586
cmtel9hc200k6v330ud37d5rc	G3pOfElCHk-D5GCpRtu6TX7dRGfan1eX	\N	2026-08-29 16:22:18.626	2026-08-29 16:22:18.626	2026-09-28 16:22:18.615
cmtel9he500kav330dbkuhi8a	q4_V3XH1iqObrU5TkHu9ft4TPYCT1FSo	\N	2026-08-29 16:22:18.702	2026-08-29 16:22:18.702	2026-09-28 16:22:18.691
cmtel9hgf00kev3302ku356f4	6meW4gj3Nx3xY0BMy0fx6JMuT_D13Xt8	\N	2026-08-29 16:22:18.783	2026-08-29 16:22:18.783	2026-09-28 16:22:18.772
cmtel9hh000kgv330c7zzg1y3	aWp7uaP05j4GVPoCMPPMsrA6cs2_KT8_	\N	2026-08-29 16:22:18.804	2026-08-29 16:22:18.804	2026-09-28 16:22:18.793
cmtel9ig200kqv3300js1055f	kBl95heSuJLQFAeZYZKhQ7UCH0-Ge-tR	\N	2026-08-29 16:22:20.067	2026-08-29 16:22:20.067	2026-09-28 16:22:20.056
cmtel9iim00ksv330bca5jljj	fA7Y5rxSdAKvAJ6SKJWS1P5N001lIosI	\N	2026-08-29 16:22:20.158	2026-08-29 16:22:20.158	2026-09-28 16:22:20.147
cmtel9il700kwv330ujgvz5fa	I-eVV-BZ4MnWJxK7jVmqFlehtFb1mA4q	\N	2026-08-29 16:22:20.251	2026-08-29 16:22:20.251	2026-09-28 16:22:20.24
cmtel9ime00kyv330phlwivyi	AbNbSUaVm1CWP9sz_kS8A1ZXjIGKiIgx	\N	2026-08-29 16:22:20.294	2026-08-29 16:22:20.294	2026-09-28 16:22:20.283
cmtel9iqm00l2v330xdn4ynx8	EliDI5bDS74TlGAcCjJ3xBW7ot223GkM	\N	2026-08-29 16:22:20.446	2026-08-29 16:22:20.446	2026-09-28 16:22:20.435
cmtel9irs00l6v330pzvlwi36	2QNpCBCVzH4ora0TPnY1Hxh4mpmoysHs	\N	2026-08-29 16:22:20.488	2026-08-29 16:22:20.488	2026-09-28 16:22:20.477
cmtel9it200lav3303fw3942h	WGQF-tsKlzEdJ5_yoQ4vOXIj5-tHR9Cy	\N	2026-08-29 16:22:20.534	2026-08-29 16:22:20.534	2026-09-28 16:22:20.524
cmtel9itt00lcv330qggif1l0	ALnsu8rsG0SWt0rKvMPMIPAdlEQZwOpu	\N	2026-08-29 16:22:20.561	2026-08-29 16:22:20.561	2026-09-28 16:22:20.55
cmtel9iv600lgv3305ows1ebj	BuRX3BRfVsOK08UVl9BnTP7-Y-6m6RBH	\N	2026-08-29 16:22:20.61	2026-08-29 16:22:20.61	2026-09-28 16:22:20.599
cmtel9iwc00lkv330u0qzbnnx	0FGgafnGMLSoLO0-8PFw8Afes3qlobP_	\N	2026-08-29 16:22:20.653	2026-08-29 16:22:20.653	2026-09-28 16:22:20.642
\.


--
-- Data for Name: CartItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."CartItem" (id, "cartId", "productId", "variantId", quantity, "stitchingServiceId", "measurementProfileId", "stitchingNotes", "createdAt", "updatedAt", "measurementValues", "customDesignText", "garmentTypeId", "sizeToken") FROM stdin;
cmt732pfr0003v364jvbmempj	cmt1c9ndj0001v33g0ltkxkk0	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-24 10:18:46.215	2026-08-24 10:18:46.215	\N	\N	\N	\N
cmt3hsndo0007v32ojpc3ftc1	cmt3hsnd70005v32oned6kns3	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	2	\N	\N	\N	2026-08-21 21:59:46.525	2026-08-21 21:59:46.525	\N	\N	\N	\N
cmt3hsnfo000bv32o3l3w28h7	cmt3hsnfc0009v32oitwgyscd	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	2	\N	\N	\N	2026-08-21 21:59:46.596	2026-08-21 21:59:46.635	\N	\N	\N	\N
cmt3hsoqq000vv32onfcc0ww9	cmt3hsopz000tv32ot3dt611x	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-21 21:59:48.29	2026-08-21 21:59:48.29	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmt3htcil0035v3moht2063e1	cmt3htcia0033v3mo20sojrbg	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-21 22:00:19.101	2026-08-21 22:00:19.101	\N	\N	\N	\N
cmt3hsoy40015v32oxoplrjed	cmt3hsoxk0013v32orglmburt	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-21 21:59:48.557	2026-08-21 21:59:48.557	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmt3hsozg0019v32ouz5u3rx0	cmt3hsoyv0017v32objtrtsh3	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-21 21:59:48.605	2026-08-21 21:59:48.605	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmt3hsp1o001fv32o9nc50t3u	cmt3hsp11001dv32oconvm30b	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-21 21:59:48.684	2026-08-21 21:59:48.684	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"kameez_finish": "Contrast piping in maroon"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmt3hsp32001jv32ol8guuxxr	cmt3hsp2g001hv32orc336k26	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-21 21:59:48.734	2026-08-21 21:59:48.734	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"kameez_finish": "Side slits to the knee"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmt3hsp4h001nv32oyo8i0bqh	cmt3hsp3u001lv32opl8x6zmq	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-21 21:59:48.785	2026-08-21 21:59:48.785	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"kameez_finish": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmtdd62h7007ev3xweeaorqkc	cmtdd62fy007cv3xwo4e32kcx	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-28 19:47:56.3	2026-08-28 19:47:56.3	\N	\N	\N	\N
cmtdd62l4007iv3xwtxvvv9vb	cmtdd62kg007gv3xwzktlau8a	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-28 19:47:56.44	2026-08-28 19:47:56.44	\N	\N	\N	\N
cmt3htck50039v3mop5kx7oao	cmt3htcjt0037v3molra6u2ps	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-21 22:00:19.157	2026-08-21 22:00:19.157	\N	\N	\N	\N
cmt3htclh003dv3mo6axzy893	cmt3htcl6003bv3mou1u2xq3f	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-21 22:00:19.205	2026-08-21 22:00:19.205	\N	\N	\N	\N
cmt3hulbr0062v3wcmq6yvv71	cmt3hulbc0060v3wc0xhkqofo	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2m005ev3uwckqmzj7j	2	\N	\N	\N	2026-08-21 22:01:17.176	2026-08-21 22:01:17.176	\N	\N	\N	\N
cmt3huldb0066v3wc94syp3st	cmt3hulcz0064v3wcejdrmxeh	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2m005ev3uwckqmzj7j	2	\N	\N	\N	2026-08-21 22:01:17.231	2026-08-21 22:01:17.264	\N	\N	\N	\N
cmt3humg3006ov3wcx5nbbrlg	cmt3humf7006mv3wcmpy1t7zm	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-21 22:01:18.627	2026-08-21 22:01:18.627	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmt3humnk006yv3wcresy8lqa	cmt3humme006wv3wcfoh0ncsc	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-21 22:01:18.896	2026-08-21 22:01:18.896	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmt3humop0072v3wclzchoyms	cmt3humo60070v3wcycoa7h8l	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-21 22:01:18.937	2026-08-21 22:01:18.937	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmt3humqr0078v3wclhhnxlr2	cmt3humq40076v3wcul4ip4aj	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-21 22:01:19.011	2026-08-21 22:01:19.011	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"kameez_finish": "Contrast piping in maroon"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmt3hums3007cv3wc708glikb	cmt3humrh007av3wcnnj7de9v	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-21 22:01:19.059	2026-08-21 22:01:19.059	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"kameez_finish": "Side slits to the knee"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmt3humtd007gv3wcu3i2o7xl	cmt3humss007ev3wcs09sklfi	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-21 22:01:19.105	2026-08-21 22:01:19.105	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"kameez_finish": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmt3huq3e00ayv3wchkzp7dx4	cmt3huq3400awv3wczcrwzhao	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-21 22:01:23.355	2026-08-21 22:01:23.355	\N	\N	\N	\N
cmt3huq4z00b2v3wc6ywxuhwe	cmt3huq4p00b0v3wcolprsufw	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-21 22:01:23.412	2026-08-21 22:01:23.412	\N	\N	\N	\N
cmt3huq6c00b6v3wc9xtk7b4e	cmt3huq5x00b4v3wc1nt9o6e7	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-21 22:01:23.46	2026-08-21 22:01:23.46	\N	\N	\N	\N
cmtdd62om007mv3xwcxvzsp20	cmtdd62nz007kv3xwwpjuy652	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-28 19:47:56.566	2026-08-28 19:47:56.566	\N	\N	\N	\N
cmtel914400adv3307k5uhs6w	cmtel913r00abv330petk8j7a	cmsx5rfcf007ev3uwymhawr74	cmsx5rfcw007kv3uwmbuiq6zn	1	\N	\N	\N	2026-08-29 16:21:57.605	2026-08-29 16:21:57.605	\N	\N	\N	\N
cmtdd643000aiv3xw30stlmvr	cmtdd642d00agv3xwjoyo6wzq	cmsx5rf70006av3uw11qoymk7	cmsx5rf7m006gv3uwoukrbm7y	1	\N	\N	\N	2026-08-28 19:47:58.381	2026-08-28 19:47:58.381	\N	\N	\N	\N
cmtel9hcl00k8v330odzagw6u	cmtel9hc200k6v330ud37d5rc	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2v005iv3uwfemuzv4e	2	\N	\N	\N	2026-08-29 16:22:18.646	2026-08-29 16:22:18.646	\N	\N	\N	\N
cmtel9hej00kcv330356dneoq	cmtel9he500kav330dbkuhi8a	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2v005iv3uwfemuzv4e	2	\N	\N	\N	2026-08-29 16:22:18.715	2026-08-29 16:22:18.758	\N	\N	\N	\N
cmtel9ij500kuv330gn9v634d	cmtel9iim00ksv330bca5jljj	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:22:20.177	2026-08-29 16:22:20.177	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	M
cmtel9ir300l4v330db7wmr1s	cmtel9iqm00l2v330xdn4ynx8	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:22:20.463	2026-08-29 16:22:20.463	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmtel9isb00l8v330cu7zeqyo	cmtel9irs00l6v330pzvlwi36	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:22:20.508	2026-08-29 16:22:20.508	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmtdd76z100kav3xwy4e4lqws	cmtdd76xz00k8v3xw9l7rzaiw	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2v005iv3uwfemuzv4e	2	\N	\N	\N	2026-08-28 19:48:48.781	2026-08-28 19:48:48.781	\N	\N	\N	\N
cmtdd773n00kev3xwhbalupf6	cmtdd772y00kcv3xwubdguiqu	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2v005iv3uwfemuzv4e	2	\N	\N	\N	2026-08-28 19:48:48.947	2026-08-28 19:48:49.038	\N	\N	\N	\N
cmtel9iug00lev330osrzvkd3	cmtel9itt00lcv330qggif1l0	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:22:20.585	2026-08-29 16:22:20.585	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"daaman_finish": "Contrast piping in maroon"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmtel9ivq00liv330gak2lmax	cmtel9iv600lgv3305ows1ebj	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:22:20.631	2026-08-29 16:22:20.631	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"daaman_finish": "Side slits to the knee"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmtel9iww00lmv330hl3jj5z9	cmtel9iwc00lkv330u0qzbnnx	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:22:20.672	2026-08-29 16:22:20.672	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"daaman_finish": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmtdd7a9m00kwv3xwp1uq428x	cmtdd7a6p00kuv3xwshc3cirx	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-28 19:48:53.05	2026-08-28 19:48:53.05	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	M
cmtel71oc00ifv3mcwdpegugy	cmtel71np00idv3mc9e2vvbn4	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:20:25.021	2026-08-29 16:20:25.021	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"daaman_finish": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmtdd7b0w00l6v3xwlcbpg504	cmtdd7ax600l4v3xwtzwccg8x	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-28 19:48:54.032	2026-08-28 19:48:54.032	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmtdd7b9a00lav3xw7w4f2yg0	cmtdd7b5100l8v3xwugqmv32b	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-28 19:48:54.334	2026-08-28 19:48:54.334	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmtdd7bg700lgv3xwstu563xy	cmtdd7bev00lev3xw6z325je3	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-28 19:48:54.583	2026-08-28 19:48:54.583	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"daaman_finish": "Contrast piping in maroon"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmtdd7biy00lkv3xw5rjxvhhu	cmtdd7bhs00liv3xw0ab1t4iq	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-28 19:48:54.683	2026-08-28 19:48:54.683	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"daaman_finish": "Side slits to the knee"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmtel71my00ibv3mc955g1qb6	cmtel71m700i9v3mciwlu2q5d	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:20:24.97	2026-08-29 16:20:24.97	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"daaman_finish": "Side slits to the knee"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmtel9jfp00lyv330hozrb30x	cmsx5k6ys0001v3q0gn7e6hqm	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	cmsx5rf70006av3uw11qoymk7	cmsx5rfdh007ov3uwh7pu18np	\N	2026-08-29 16:22:21.349	2026-08-29 16:22:21.349	\N	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmtdd7bmp00lov3xwww66rdz9	cmtdd7bld00lmv3xwlfz45tnh	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-28 19:48:54.817	2026-08-28 19:48:54.817	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"daaman_finish": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmtel907z0079v330c0hlqtli	cmtel907k0077v330bja5xbet	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-29 16:21:56.448	2026-08-29 16:21:56.448	\N	\N	\N	\N
cmtel909p007dv330ifysp1fx	cmtel909f007bv330ovnivf54	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-29 16:21:56.51	2026-08-29 16:21:56.51	\N	\N	\N	\N
cmtel90b3007hv330274loc4x	cmtel90as007fv33025j76hz5	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-29 16:21:56.56	2026-08-29 16:21:56.56	\N	\N	\N	\N
cmtel4ywx0045v32se2xn912x	cmtel4ywl0043v32s3tdlhz88	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-29 16:18:48.129	2026-08-29 16:18:48.129	\N	\N	\N	\N
cmtel4yye0049v32sb6d89dfb	cmtel4yy30047v32sjw7lrjk1	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-29 16:18:48.182	2026-08-29 16:18:48.182	\N	\N	\N	\N
cmtel4yzn004dv32ssxxtkejo	cmtel4yzc004bv32syru8qjeq	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-29 16:18:48.228	2026-08-29 16:18:48.228	\N	\N	\N	\N
cmtel4zma0079v32s4zye0nce	cmtel4zly0077v32sgkn93olh	cmsx5rf70006av3uw11qoymk7	cmsx5rf7m006gv3uwoukrbm7y	1	\N	\N	\N	2026-08-29 16:18:49.043	2026-08-29 16:18:49.043	\N	\N	\N	\N
cmtel55tr00dvv32simz1knki	cmtel55tc00dtv32safuujhqf	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2v005iv3uwfemuzv4e	2	\N	\N	\N	2026-08-29 16:18:57.087	2026-08-29 16:18:57.087	\N	\N	\N	\N
cmtel55va00dzv32sxqqp2mrt	cmtel55uz00dxv32stk5mhc60	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2v005iv3uwfemuzv4e	2	\N	\N	\N	2026-08-29 16:18:57.143	2026-08-29 16:18:57.178	\N	\N	\N	\N
cmtel56yl00ehv32s7uxsvmvq	cmtel56xw00efv32s5dsj3f9p	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:18:58.557	2026-08-29 16:18:58.557	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	M
cmtel577400erv32sgx0hcx6w	cmtel576k00epv32se8by7f8g	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:18:58.864	2026-08-29 16:18:58.864	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmtel578p00evv32so6c0vl7a	cmtel578200etv32sldhdswjj	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:18:58.922	2026-08-29 16:18:58.922	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmtel57ar00f1v32sezf7n49r	cmtel57a700ezv32s78ty7a3t	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:18:58.995	2026-08-29 16:18:58.995	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"daaman_finish": "Contrast piping in maroon"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmtel57c700f5v32svnwfkiat	cmtel57bk00f3v32sf088krcv	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:18:59.047	2026-08-29 16:18:59.047	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"daaman_finish": "Side slits to the knee"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmtel57dj00f9v32syb8izzxq	cmtel57cy00f7v32s8e2kpfg5	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:18:59.095	2026-08-29 16:18:59.095	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"daaman_finish": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}	cmsx5rek50007v3uwzg0vl4hk	\N
cmtel6tyu007bv3mcfm5q423q	cmtel6tyl0079v3mc3kobofra	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-29 16:20:15.031	2026-08-29 16:20:15.031	\N	\N	\N	\N
cmtel6u0g007fv3mcjduclo1k	cmtel6u04007dv3mc8elglg31	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-29 16:20:15.088	2026-08-29 16:20:15.088	\N	\N	\N	\N
cmtel6u1u007jv3mczx2jf36f	cmtel6u1h007hv3mcbmxfhxu8	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2i005cv3uwk782tbox	1	\N	\N	\N	2026-08-29 16:20:15.138	2026-08-29 16:20:15.138	\N	\N	\N	\N
cmtel6uv700afv3mctxjbn8jl	cmtel6uuw00adv3mc2jyfbdmy	cmsx5rf9u006uv3uwk0mdko1w	cmsx5rfak0070v3uwz9neyuw2	1	\N	\N	\N	2026-08-29 16:20:16.196	2026-08-29 16:20:16.196	\N	\N	\N	\N
cmtel700w00h1v3mcstovjjv4	cmtel700g00gzv3mcay6o0jl2	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2v005iv3uwfemuzv4e	2	\N	\N	\N	2026-08-29 16:20:22.88	2026-08-29 16:20:22.88	\N	\N	\N	\N
cmtel702g00h5v3mcsqgb144e	cmtel702400h3v3mc9xoad6hv	cmsx5rf250056v3uwa9eo18j0	cmsx5rf2v005iv3uwfemuzv4e	2	\N	\N	\N	2026-08-29 16:20:22.937	2026-08-29 16:20:22.971	\N	\N	\N	\N
cmtel719500hnv3mcnrjamu5n	cmtel718k00hlv3mckbxec2tn	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:20:24.473	2026-08-29 16:20:24.473	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	M
cmtel71hd00hxv3mcsu52pbnw	cmtel71gt00hvv3mc9g92yiu9	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:20:24.77	2026-08-29 16:20:24.77	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmtel71j700i1v3mc17hnyzp5	cmtel71i500hzv3mcsj144w9z	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:20:24.836	2026-08-29 16:20:24.836	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	cmsx5rek50007v3uwzg0vl4hk	\N
cmtel71lg00i7v3mcpq5yffcy	cmtel71kt00i5v3mceb9zucvc	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	1	\N	\N	\N	2026-08-29 16:20:24.916	2026-08-29 16:20:24.916	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	{"daaman_finish": "Contrast piping in maroon"}	cmsx5rek50007v3uwzg0vl4hk	\N
\.


--
-- Data for Name: CartItemStitchingOption; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."CartItemStitchingOption" ("cartItemId", "optionId") FROM stdin;
cmt3hsoqq000vv32onfcc0ww9	cmsx5reqk002kv3uwtul81stq
cmt3hsoqq000vv32onfcc0ww9	cmsx5rerc002uv3uwwhl3xukv
cmt3hsoy40015v32oxoplrjed	cmsx5reqk002kv3uwtul81stq
cmt3hsoy40015v32oxoplrjed	cmsx5rerc002uv3uwwhl3xukv
cmt3hsozg0019v32ouz5u3rx0	cmsx5reqy002ov3uwpja67sg9
cmt3hsozg0019v32ouz5u3rx0	cmsx5rerc002uv3uwwhl3xukv
cmt3hsozg0019v32ouz5u3rx0	cmsx5rerz0034v3uw3jd9jb6j
cmt3hsp1o001fv32o9nc50t3u	cmsx5reqk002kv3uwtul81stq
cmt3hsp1o001fv32o9nc50t3u	cmsx5rerc002uv3uwwhl3xukv
cmt3hsp32001jv32ol8guuxxr	cmsx5reqk002kv3uwtul81stq
cmt3hsp32001jv32ol8guuxxr	cmsx5rerc002uv3uwwhl3xukv
cmt3hsp4h001nv32oyo8i0bqh	cmsx5reqk002kv3uwtul81stq
cmt3hsp4h001nv32oyo8i0bqh	cmsx5rerc002uv3uwwhl3xukv
cmtel9ij500kuv330gn9v634d	cmsx5reqk002kv3uwtul81stq
cmtel9ij500kuv330gn9v634d	cmsx5rerc002uv3uwwhl3xukv
cmtel9ir300l4v330db7wmr1s	cmsx5reqk002kv3uwtul81stq
cmtel9ir300l4v330db7wmr1s	cmsx5rerc002uv3uwwhl3xukv
cmtel9isb00l8v330cu7zeqyo	cmsx5reqy002ov3uwpja67sg9
cmtel9isb00l8v330cu7zeqyo	cmsx5rerc002uv3uwwhl3xukv
cmtel9isb00l8v330cu7zeqyo	cmtdcvbwz00iev3gcq2w8bnag
cmtel9iug00lev330osrzvkd3	cmsx5reqk002kv3uwtul81stq
cmtel9iug00lev330osrzvkd3	cmsx5rerc002uv3uwwhl3xukv
cmtel9ivq00liv330gak2lmax	cmsx5reqk002kv3uwtul81stq
cmtel9ivq00liv330gak2lmax	cmsx5rerc002uv3uwwhl3xukv
cmt3humg3006ov3wcx5nbbrlg	cmsx5reqk002kv3uwtul81stq
cmt3humg3006ov3wcx5nbbrlg	cmsx5rerc002uv3uwwhl3xukv
cmtel9iww00lmv330hl3jj5z9	cmsx5reqk002kv3uwtul81stq
cmtel9iww00lmv330hl3jj5z9	cmsx5rerc002uv3uwwhl3xukv
cmt3humnk006yv3wcresy8lqa	cmsx5reqk002kv3uwtul81stq
cmt3humnk006yv3wcresy8lqa	cmsx5rerc002uv3uwwhl3xukv
cmt3humop0072v3wclzchoyms	cmsx5reqy002ov3uwpja67sg9
cmt3humop0072v3wclzchoyms	cmsx5rerc002uv3uwwhl3xukv
cmt3humop0072v3wclzchoyms	cmsx5rerz0034v3uw3jd9jb6j
cmt3humqr0078v3wclhhnxlr2	cmsx5reqk002kv3uwtul81stq
cmt3humqr0078v3wclhhnxlr2	cmsx5rerc002uv3uwwhl3xukv
cmt3hums3007cv3wc708glikb	cmsx5reqk002kv3uwtul81stq
cmt3hums3007cv3wc708glikb	cmsx5rerc002uv3uwwhl3xukv
cmt3humtd007gv3wcu3i2o7xl	cmsx5reqk002kv3uwtul81stq
cmt3humtd007gv3wcu3i2o7xl	cmsx5rerc002uv3uwwhl3xukv
cmtel9jfp00lyv330hozrb30x	cmsx5reqk002kv3uwtul81stq
cmtel9jfp00lyv330hozrb30x	cmsx5rerc002uv3uwwhl3xukv
cmtdd7a9m00kwv3xwp1uq428x	cmsx5reqk002kv3uwtul81stq
cmtdd7a9m00kwv3xwp1uq428x	cmsx5rerc002uv3uwwhl3xukv
cmtdd7b0w00l6v3xwlcbpg504	cmsx5reqk002kv3uwtul81stq
cmtdd7b0w00l6v3xwlcbpg504	cmsx5rerc002uv3uwwhl3xukv
cmtdd7b9a00lav3xw7w4f2yg0	cmsx5reqy002ov3uwpja67sg9
cmtdd7b9a00lav3xw7w4f2yg0	cmsx5rerc002uv3uwwhl3xukv
cmtdd7b9a00lav3xw7w4f2yg0	cmtdcvbwz00iev3gcq2w8bnag
cmtdd7bg700lgv3xwstu563xy	cmsx5reqk002kv3uwtul81stq
cmtdd7bg700lgv3xwstu563xy	cmsx5rerc002uv3uwwhl3xukv
cmtdd7biy00lkv3xw5rjxvhhu	cmsx5reqk002kv3uwtul81stq
cmtdd7biy00lkv3xw5rjxvhhu	cmsx5rerc002uv3uwwhl3xukv
cmtdd7bmp00lov3xwww66rdz9	cmsx5reqk002kv3uwtul81stq
cmtdd7bmp00lov3xwww66rdz9	cmsx5rerc002uv3uwwhl3xukv
cmtel56yl00ehv32s7uxsvmvq	cmsx5reqk002kv3uwtul81stq
cmtel56yl00ehv32s7uxsvmvq	cmsx5rerc002uv3uwwhl3xukv
cmtel577400erv32sgx0hcx6w	cmsx5reqk002kv3uwtul81stq
cmtel577400erv32sgx0hcx6w	cmsx5rerc002uv3uwwhl3xukv
cmtel578p00evv32so6c0vl7a	cmsx5reqy002ov3uwpja67sg9
cmtel578p00evv32so6c0vl7a	cmsx5rerc002uv3uwwhl3xukv
cmtel578p00evv32so6c0vl7a	cmtdcvbwz00iev3gcq2w8bnag
cmtel57ar00f1v32sezf7n49r	cmsx5reqk002kv3uwtul81stq
cmtel57ar00f1v32sezf7n49r	cmsx5rerc002uv3uwwhl3xukv
cmtel57c700f5v32svnwfkiat	cmsx5reqk002kv3uwtul81stq
cmtel57c700f5v32svnwfkiat	cmsx5rerc002uv3uwwhl3xukv
cmtel57dj00f9v32syb8izzxq	cmsx5reqk002kv3uwtul81stq
cmtel57dj00f9v32syb8izzxq	cmsx5rerc002uv3uwwhl3xukv
cmtel719500hnv3mcnrjamu5n	cmsx5reqk002kv3uwtul81stq
cmtel719500hnv3mcnrjamu5n	cmsx5rerc002uv3uwwhl3xukv
cmtel71hd00hxv3mcsu52pbnw	cmsx5reqk002kv3uwtul81stq
cmtel71hd00hxv3mcsu52pbnw	cmsx5rerc002uv3uwwhl3xukv
cmtel71j700i1v3mc17hnyzp5	cmsx5reqy002ov3uwpja67sg9
cmtel71j700i1v3mc17hnyzp5	cmsx5rerc002uv3uwwhl3xukv
cmtel71j700i1v3mc17hnyzp5	cmtdcvbwz00iev3gcq2w8bnag
cmtel71lg00i7v3mcpq5yffcy	cmsx5reqk002kv3uwtul81stq
cmtel71lg00i7v3mcpq5yffcy	cmsx5rerc002uv3uwwhl3xukv
cmtel71my00ibv3mc955g1qb6	cmsx5reqk002kv3uwtul81stq
cmtel71my00ibv3mc955g1qb6	cmsx5rerc002uv3uwwhl3xukv
cmtel71oc00ifv3mcwdpegugy	cmsx5reqk002kv3uwtul81stq
cmtel71oc00ifv3mcwdpegugy	cmsx5rerc002uv3uwwhl3xukv
\.


--
-- Data for Name: Category; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Category" (id, slug, "parentId", "imageUrl", "order", "isActive", "createdAt", "updatedAt") FROM stdin;
cmsx5revc0046v3uw6cacpji6	menswear	\N	\N	4	t	2026-08-17 11:36:16.392	2026-08-17 11:36:16.392
cmsx5retl003rv3uw2w0v7gog	unstitched	\N	\N	1	t	2026-08-17 11:36:16.329	2026-08-28 23:11:56.05
cmsx5reuj003wv3uwvx7hg9cp	ready-to-wear	\N	\N	2	t	2026-08-17 11:36:16.364	2026-08-28 23:11:56.067
cmsx5reuz0041v3uwyo3xh5be	stitching-services	\N	\N	3	t	2026-08-17 11:36:16.379	2026-08-28 23:11:56.077
cmt1dpumy0046v3iouh4skyrx	kids-wear	\N	\N	4	t	2026-08-20 10:30:05.146	2026-08-28 23:11:56.086
\.


--
-- Data for Name: CategoryTranslation; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."CategoryTranslation" (id, "categoryId", locale, name, description) FROM stdin;
cmsx5revf0048v3uw30wpp9ds	cmsx5revc0046v3uw6cacpji6	en	Menswear	\N
cmsx5revi004av3uw19p8d7jr	cmsx5revc0046v3uw6cacpji6	ur	مردانہ	\N
cmsx5reu4003tv3uwmija3p6l	cmsx5retl003rv3uw2w0v7gog	en	Unstitched	\N
cmsx5reud003vv3uwopm7hehf	cmsx5retl003rv3uw2w0v7gog	ur	اَن سلا	\N
cmsx5reun003yv3uweo5kmi21	cmsx5reuj003wv3uwvx7hg9cp	en	Ready to Wear	\N
cmsx5reur0040v3uwb88cxtop	cmsx5reuj003wv3uwvx7hg9cp	ur	سلا ہوا	\N
cmsx5rev30043v3uw7ugd9l1o	cmsx5reuz0041v3uwyo3xh5be	en	Stitching Services	\N
cmsx5rev80045v3uw0komrc8y	cmsx5reuz0041v3uwyo3xh5be	ur	سلائی سروسز	\N
cmt1dpun20048v3io38vi45v7	cmt1dpumy0046v3iouh4skyrx	en	Kids Wear	\N
cmt1dpun6004av3io5i8jobeq	cmt1dpumy0046v3iouh4skyrx	ur	بچوں کے کپڑے	\N
\.


--
-- Data for Name: Contact; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Contact" (id, "phoneE164", email, name, city, source, status, "ownerId", "userId", notes, "orderCount", "lifetimeValue", "avgOrderValue", "lastOrderAt", "firstOrderAt", "createdAt", "updatedAt") FROM stdin;
cmsxjvlhj000kv3ugqnox2mgh	+923089270737	nommimalik308@gmail.com	ali	Rohillanwali	storefront	ACTIVE	\N	\N	\N	1	1105000	1105000	2026-08-17 18:11:24.292	2026-08-17 18:11:24.292	2026-08-17 18:11:26.212	2026-08-29 16:21:52.258
cmt3htd2k003fv3mo0trym46r	+923001234567	ayesha@example.com	Ayesha Khan	Karachi	storefront	ACTIVE	\N	cmsx5rehl0005v3uwdwy4jud8	\N	1	580000	580000	2026-08-29 16:22:06.265	2026-08-29 16:22:06.265	2026-08-21 22:00:19.82	2026-08-29 16:22:06.405
cmt3hu0n6000xv3wcphq2japu	+923445556666	\N	Sana Iqbal	Lahore	storefront	ACTIVE	\N	\N	\N	1	329900	329900	2026-08-29 16:22:06.737	2026-08-29 16:22:06.737	2026-08-21 22:00:50.37	2026-08-29 16:22:06.832
\.


--
-- Data for Name: ContactTag; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ContactTag" ("contactId", "tagId") FROM stdin;
\.


--
-- Data for Name: DeviceToken; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."DeviceToken" (id, "userId", token, platform, "appVersion", locale, "lastSeenAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: FollowUpTask; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."FollowUpTask" (id, "contactId", "leadId", "assigneeId", note, "dueAt", "isDone", "doneAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: GarmentSizeChart; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."GarmentSizeChart" (id, "garmentTypeId", "sizeToken", "values", "order", "createdAt", "updatedAt") FROM stdin;
cmtdcvblf00b8v3gc3rhv7auv	cmsx5rek50007v3uwzg0vl4hk	M	{"hips": 43, "chest": 40, "waist": 34, "length": 42, "shoulder": 14.5}	2	2026-08-28 19:39:34.899	2026-08-28 23:11:55.533
cmtdcvbli00bav3gcqiffjkdt	cmsx5rek50007v3uwzg0vl4hk	L	{"hips": 47, "chest": 44, "waist": 38, "length": 44, "shoulder": 15.5}	3	2026-08-28 19:39:34.903	2026-08-28 23:11:55.536
cmtdcvbln00bcv3gc3ixdbpth	cmsx5rek50007v3uwzg0vl4hk	XL	{"hips": 52, "chest": 48, "waist": 42, "length": 45, "shoulder": 16.5}	4	2026-08-28 19:39:34.907	2026-08-28 23:11:55.539
cmtdcvblr00bev3gclayxd4mq	cmsx5rek50007v3uwzg0vl4hk	XXL	{"hips": 56, "chest": 52, "waist": 46, "length": 45, "shoulder": 17.5}	5	2026-08-28 19:39:34.911	2026-08-28 23:11:55.542
cmtdcvblu00bgv3gc8k5jaabc	cmtdcvbe1007gv3gcafggbfff	XS	{"hips": 36, "chest": 34, "waist": 28, "shoulder": 13.5, "short_length": 38}	0	2026-08-28 19:39:34.914	2026-08-28 23:11:55.545
cmtdcvblx00biv3gck1z4z0eo	cmtdcvbe1007gv3gcafggbfff	S	{"hips": 38, "chest": 36, "waist": 30, "shoulder": 14, "short_length": 40}	1	2026-08-28 19:39:34.917	2026-08-28 23:11:55.548
cmtdcvbm000bkv3gcyr69ahgj	cmtdcvbe1007gv3gcafggbfff	M	{"hips": 43, "chest": 40, "waist": 34, "shoulder": 14.5, "short_length": 42}	2	2026-08-28 19:39:34.92	2026-08-28 23:11:55.55
cmtdcvbm300bmv3gc8jjocmwl	cmtdcvbe1007gv3gcafggbfff	L	{"hips": 47, "chest": 44, "waist": 38, "shoulder": 15.5, "short_length": 44}	3	2026-08-28 19:39:34.923	2026-08-28 23:11:55.552
cmtdcvbm600bov3gcvy0uxbk2	cmtdcvbe1007gv3gcafggbfff	XL	{"hips": 52, "chest": 48, "waist": 42, "shoulder": 16.5, "short_length": 45}	4	2026-08-28 19:39:34.926	2026-08-28 23:11:55.555
cmtdcvbm900bqv3gcogqpllrj	cmtdcvbe1007gv3gcafggbfff	XXL	{"hips": 56, "chest": 52, "waist": 46, "shoulder": 17.5, "short_length": 45}	5	2026-08-28 19:39:34.929	2026-08-28 23:11:55.558
cmtdcvbmc00bsv3gcerjfexrg	cmtdcvbek007rv3gcoxtwyj5j	XS	{"chest": 34, "waist": 28, "shoulder": 13.5, "center_front_length": 38}	0	2026-08-28 19:39:34.932	2026-08-28 23:11:55.561
cmtdcvbmf00buv3gc3qlf5864	cmtdcvbek007rv3gcoxtwyj5j	S	{"chest": 36, "waist": 30, "shoulder": 14, "center_front_length": 40}	1	2026-08-28 19:39:34.935	2026-08-28 23:11:55.564
cmtdcvbmh00bwv3gc9apw83aj	cmtdcvbek007rv3gcoxtwyj5j	M	{"chest": 40, "waist": 34, "shoulder": 14.5, "center_front_length": 42}	2	2026-08-28 19:39:34.938	2026-08-28 23:11:55.567
cmtdcvbml00byv3gct6epd72r	cmtdcvbek007rv3gcoxtwyj5j	L	{"chest": 44, "waist": 38, "shoulder": 15.5, "center_front_length": 44}	3	2026-08-28 19:39:34.941	2026-08-28 23:11:55.57
cmtdcvbmo00c0v3gclvr2o4qg	cmtdcvbek007rv3gcoxtwyj5j	XL	{"chest": 48, "waist": 42, "shoulder": 16.5, "center_front_length": 45}	4	2026-08-28 19:39:34.944	2026-08-28 23:11:55.573
cmtdcvbmr00c2v3gcv4r36s47	cmtdcvbek007rv3gcoxtwyj5j	XXL	{"chest": 52, "waist": 46, "shoulder": 17.5, "center_front_length": 45}	5	2026-08-28 19:39:34.947	2026-08-28 23:11:55.576
cmtdcvbmu00c4v3gcya9fmqih	cmtdcvbf80084v3gc0v3dy7lt	XS	{"chest": 34, "waist": 28, "length": 38, "shoulder": 13.5}	0	2026-08-28 19:39:34.95	2026-08-28 23:11:55.579
cmtdcvbmx00c6v3gcy6riltn2	cmtdcvbf80084v3gc0v3dy7lt	S	{"chest": 36, "waist": 30, "length": 40, "shoulder": 14}	1	2026-08-28 19:39:34.953	2026-08-28 23:11:55.581
cmtdcvbn000c8v3gcaws1mcua	cmtdcvbf80084v3gc0v3dy7lt	M	{"chest": 40, "waist": 34, "length": 42, "shoulder": 14.5}	2	2026-08-28 19:39:34.957	2026-08-28 23:11:55.583
cmtdcvbn400cav3gcdj6x9uax	cmtdcvbf80084v3gc0v3dy7lt	L	{"chest": 44, "waist": 38, "length": 44, "shoulder": 15.5}	3	2026-08-28 19:39:34.96	2026-08-28 23:11:55.585
cmtdcvbn600ccv3gcr3sb2crv	cmtdcvbf80084v3gc0v3dy7lt	XL	{"chest": 48, "waist": 42, "length": 45, "shoulder": 16.5}	4	2026-08-28 19:39:34.962	2026-08-28 23:11:55.589
cmtdcvbn900cev3gcfo89dsph	cmtdcvbf80084v3gc0v3dy7lt	XXL	{"chest": 52, "waist": 46, "length": 45, "shoulder": 17.5}	5	2026-08-28 19:39:34.965	2026-08-28 23:11:55.591
cmtdcvbnc00cgv3gcudq1qzsx	cmsx5rem6000sv3uw27ole3ls	XS	{"waist": 28, "length": 37}	0	2026-08-28 19:39:34.968	2026-08-28 23:11:55.594
cmtdcvbne00civ3gctfswc5z1	cmsx5rem6000sv3uw27ole3ls	S	{"waist": 30, "length": 38}	1	2026-08-28 19:39:34.971	2026-08-28 23:11:55.597
cmtdcvbni00ckv3gcjcr2691e	cmsx5rem6000sv3uw27ole3ls	M	{"waist": 34, "length": 39}	2	2026-08-28 19:39:34.974	2026-08-28 23:11:55.599
cmtdcvbnl00cmv3gckuowky45	cmsx5rem6000sv3uw27ole3ls	L	{"waist": 38, "length": 40}	3	2026-08-28 19:39:34.977	2026-08-28 23:11:55.601
cmtdcvbnn00cov3gc966gryry	cmsx5rem6000sv3uw27ole3ls	XL	{"waist": 42, "length": 40}	4	2026-08-28 19:39:34.98	2026-08-28 23:11:55.604
cmtdcvbnq00cqv3gctz14uk1n	cmsx5rem6000sv3uw27ole3ls	XXL	{"waist": 46, "length": 41}	5	2026-08-28 19:39:34.982	2026-08-28 23:11:55.607
cmtdcvbnt00csv3gcodv7lb2t	cmsx5remv0013v3uwg59rhzgv	XS	{"hips": 36, "waist": 28, "length": 37}	0	2026-08-28 19:39:34.985	2026-08-28 23:11:55.61
cmtdcvbnw00cuv3gco736tu56	cmsx5remv0013v3uwg59rhzgv	S	{"hips": 38, "waist": 30, "length": 38}	1	2026-08-28 19:39:34.988	2026-08-28 23:11:55.613
cmtdcvbo000cwv3gc3p5obcjs	cmsx5remv0013v3uwg59rhzgv	M	{"hips": 43, "waist": 34, "length": 39}	2	2026-08-28 19:39:34.992	2026-08-28 23:11:55.615
cmtdcvbo200cyv3gc6szn76bt	cmsx5remv0013v3uwg59rhzgv	L	{"hips": 47, "waist": 38, "length": 40}	3	2026-08-28 19:39:34.995	2026-08-28 23:11:55.618
cmtdcvbo500d0v3gc36c6u67v	cmsx5remv0013v3uwg59rhzgv	XL	{"hips": 52, "waist": 42, "length": 40}	4	2026-08-28 19:39:34.997	2026-08-28 23:11:55.62
cmtdcvbo800d2v3gc0c5l9six	cmsx5remv0013v3uwg59rhzgv	XXL	{"hips": 56, "waist": 46, "length": 41}	5	2026-08-28 19:39:35	2026-08-28 23:11:55.623
cmtdcvbky00b4v3gcewlkvdpf	cmsx5rek50007v3uwzg0vl4hk	XS	{"hips": 36, "chest": 34, "waist": 28, "length": 38, "shoulder": 13.5}	0	2026-08-28 19:39:34.882	2026-08-28 23:11:55.52
cmtdcvblc00b6v3gc6e97tpe9	cmsx5rek50007v3uwzg0vl4hk	S	{"hips": 38, "chest": 36, "waist": 30, "length": 40, "shoulder": 14}	1	2026-08-28 19:39:34.897	2026-08-28 23:11:55.53
\.


--
-- Data for Name: GarmentType; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."GarmentType" (id, key, "labelEn", "labelUr", "order", "isActive", "createdAt", "updatedAt", "stitchingPrice", "stitchingEnabled", "baseFabricGaz", "aliasesEn", "aliasesUr") FROM stdin;
cmtdcvbh90098v3gcrbzlv38a	abaya_kaftan	Abaya & Kaftan	عبایا اور قفطان	16	t	2026-08-28 19:39:34.75	2026-08-28 23:11:55.411	150000	t	5	{Abaya,Kaftan}	{عبایا,قفطان}
cmtdcvbhw009hv3gc1jho2v1e	patiala_shalwar	Patiala Shalwar (Heavy Trousers)	پٹیالہ شلوار	17	t	2026-08-28 19:39:34.772	2026-08-28 23:11:55.429	130000	t	4	{"Patiala Shalwar","Shahi Shalwar"}	{"پٹیالہ شلوار","شاہی شلوار"}
cmtdcvbia009ov3gcy1e8o8g7	churidar_pajama	Churidar Pajama (Gathered Leggings)	چوڑی دار پاجامہ	18	t	2026-08-28 19:39:34.787	2026-08-28 23:11:55.441	80000	t	2.5	{"Churidar Pyjama","Moti Pants"}	{"چوڑی دار پاجامہ","موتی پینٹ"}
cmsx5remv0013v3uwg59rhzgv	trouser	Trouser	ٹراؤزر	3	t	2026-08-17 11:36:16.088	2026-08-28 23:11:55.19	70000	t	2.25	{"Straight Trousers","Cigarette Pants"}	{"سیدھی ٹراؤزر","سگریٹ پینٹ"}
cmsx5rent001gv3uwu7e5gsav	kurta	Kurta (men)	کرتا (مردانہ)	4	t	2026-08-17 11:36:16.122	2026-08-28 23:11:55.077	140000	t	\N	{}	{}
cmtdcvbjv00ahv3gcbcyvnilw	gharara	Gharara (Knee-Gathered Flare)	گھارا	21	t	2026-08-28 19:39:34.843	2026-08-28 23:11:55.486	170000	t	4.5	{"Gharara Trouser","Ruched Joint Pant"}	{"گھارا ٹراؤزر","روچڈ جوائنٹ پینٹ"}
cmtdcvbek007rv3gcoxtwyj5j	coord_top	Co-ord Top	کو آرڈ ٹاپ	11	t	2026-08-28 19:39:34.652	2026-08-28 23:11:55.313	95000	t	2.25	{"Co-ord Top","Matching Twin Set"}	{"کو آرڈ ٹاپ","میچنگ ٹوئن سیٹ"}
cmtdcvbf80084v3gc0v3dy7lt	aline_tunic	A-Line Tunic	اے لائن ٹیونک	12	t	2026-08-28 19:39:34.676	2026-08-28 23:11:55.341	130000	t	3	{"Flared Shirt","No-Slit Tunic"}	{"فلیئرڈ شرٹ","بغیر چاک ٹیونک"}
cmsx5reon001tv3uw4yhfp4if	waistcoat	Waistcoat	واسکٹ	5	t	2026-08-17 11:36:16.151	2026-08-28 23:11:55.098	180000	t	\N	{}	{}
cmtdcvbbz0069v3gcw9lr9j4h	anarkali	Anarkali (Kalidar Frock)	انارکلی (کلی دار فراک)	7	t	2026-08-28 19:39:34.559	2026-08-28 23:11:55.2	180000	t	5	{Anarkali,"Panel Dress",Gown}	{انارکلی,"پینل ڈریس",گاؤن}
cmtdcvbiv009zv3gcgnwnr883	tulip_shalwar	Tulip Shalwar (Petal Trousers)	ٹیولپ شلوار	19	t	2026-08-28 19:39:34.807	2026-08-28 23:11:55.458	75000	t	2.5	{"Tulip Shalwar","Petal Pant"}	{"ٹیولپ شلوار","پیٹل پینٹ"}
cmtdcvbkh00auv3gccscv50wt	sharara_palazzo	Sharara / Palazzo (Flared Skirt Pants)	شرارہ / پلازو	22	t	2026-08-28 19:39:34.866	2026-08-28 23:11:55.508	105000	t	3.5	{Sharara,Palazzo,"Divided Skirt"}	{شرارہ,پلازو,"ڈیوائیڈڈ اسکرٹ"}
cmtdcvbcu006qv3gc485k4nsr	angrakha	Angrakha	انگرکھا	8	t	2026-08-28 19:39:34.59	2026-08-28 23:11:55.231	150000	t	3.5	{"Cross-over Kurti","Traditional Jama"}	{"کراس اوور کرتی","روایتی جامہ"}
cmtdcvbdj0075v3gck398dved	floor_gown	Floor Gown (Peshwas)	فرش پوش گاؤن (پیش واز)	9	t	2026-08-28 19:39:34.615	2026-08-28 23:11:55.265	220000	t	6.5	{Peshwas,"Royal Maxi"}	{"پیش واز","رائل میکسی"}
cmtdcvbfr008fv3gcpu0qb2v8	lehenga	Lehenga (Ghagra)	لہنگا (گھاگرا)	13	t	2026-08-28 19:39:34.696	2026-08-28 23:11:55.364	350000	t	6	{"Grand Flared Skirt",Ghagra,"Pavadai Skirt"}	{گھاگرا,"پاواڈائی اسکرٹ"}
cmtdcvbe1007gv3gcafggbfff	short_kurti	Short Kurti	شارٹ کرتی	10	t	2026-08-28 19:39:34.634	2026-08-28 23:11:55.286	100000	t	2	{"Hip-Length Shirt","Crop Tunic"}	{"ہپ لینتھ شرٹ","کراپ ٹیونک"}
cmsx5rek50007v3uwzg0vl4hk	kameez	Kameez	قمیض	1	t	2026-08-17 11:36:15.989	2026-08-29 16:22:21.394	120000	t	2.5	{"Straight Kurta",Qameez,"Long Shirt"}	{"سٹریٹ کرتا",قمیض,"لمبی شرٹ"}
cmtdcvbgb008qv3gc7yvagsps	saree_petticoat	Saree Petticoat	ساڑھی پیٹی کوٹ	14	t	2026-08-28 19:39:34.715	2026-08-28 23:11:55.382	50000	t	1.5	{"Saree Underskirt",In-skirt}	{"اندرونی اسکرٹ"}
cmtdcvbgo008xv3gcqmzi9tu1	maxi_dress	Maxi Dress	میکسی ڈریس	15	t	2026-08-28 19:39:34.728	2026-08-28 23:11:55.394	160000	t	5.5	{}	{}
cmtdcvbjh00aav3gcycbsp1dy	dhoti_shalwar	Dhoti Shalwar (Draped Pants)	دھوتی شلوار	20	t	2026-08-28 19:39:34.829	2026-08-28 23:11:55.475	70000	t	2.5	{"Dhoti Shalwar","Curved Drape Pant"}	{"دھوتی شلوار","خمدار ڈریپ پینٹ"}
cmsx5rep30022v3uwxeh1yape	blouse	Blouse / choli	بلاؤز / چولی	6	t	2026-08-17 11:36:16.168	2026-08-28 23:11:55.164	90000	t	1.25	{Choli,"Saree Blouse","Katori Blouse"}	{چولی,"ساڑھی بلاؤز","کٹوری بلاؤز"}
cmsx5rem6000sv3uw27ole3ls	shalwar	Shalwar	شلوار	2	t	2026-08-17 11:36:16.062	2026-08-28 23:11:55.182	60000	t	2.5	{"Simple Shalwar","Traditional Pants"}	{"سادہ شلوار","روایتی پتلون"}
\.


--
-- Data for Name: GoodsReceipt; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."GoodsReceipt" (id, number, "purchaseOrderId", "receivedAt", "receivedById", notes, "freightCost", "dutyCost", "otherCost", "createdAt") FROM stdin;
\.


--
-- Data for Name: GoodsReceiptItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."GoodsReceiptItem" (id, "goodsReceiptId", "purchaseOrderItemId", "variantId", quantity, "unitCost", "landedUnitCost") FROM stdin;
\.


--
-- Data for Name: Interaction; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Interaction" (id, "contactId", "leadId", kind, body, "actorId", "occurredAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: Lead; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Lead" (id, "contactId", name, phone, email, message, source, status, "ownerId", "quotedValue", "lostReason", "convertedOrderId", "convertedAt", "createdAt", "updatedAt") FROM stdin;
cmt3hu6ap003pv3wchxi86asu	\N	Hina Malik	+923219998877	\N	Do you stitch bridal lehengas?	contact_form	NEW	\N	\N	\N	\N	\N	2026-08-21 22:00:57.697	2026-08-21 22:00:57.697
cmt3hu6b8003rv3wc0rcnle0s	\N	Fatima Ali	+923331234567	\N	Any new khaddar?	contact_form	NEW	\N	\N	\N	\N	\N	2026-08-21 22:00:57.717	2026-08-21 22:00:57.717
cmtdd6sp700iuv3xwtjtu3zml	\N	Hina Malik	+923219998877	\N	Do you stitch bridal lehengas?	contact_form	NEW	\N	\N	\N	\N	\N	2026-08-28 19:48:30.283	2026-08-28 19:48:30.283
cmtdd6stg00iwv3xwtva2c40f	\N	Fatima Ali	+923331234567	\N	Any new khaddar?	contact_form	NEW	\N	\N	\N	\N	\N	2026-08-28 19:48:30.436	2026-08-28 19:48:30.436
cmtel5ize00isv32sn2h5ztce	\N	Hina Malik	+923219998877	\N	Do you stitch bridal lehengas?	contact_form	NEW	\N	\N	\N	\N	\N	2026-08-29 16:19:14.139	2026-08-29 16:19:14.139
cmtel5izs00iuv32sw0obqjqc	\N	Fatima Ali	+923331234567	\N	Any new khaddar?	contact_form	NEW	\N	\N	\N	\N	\N	2026-08-29 16:19:14.152	2026-08-29 16:19:14.152
cmtel6p36001xv3mcxc2fmx0c	\N	Hina Malik	+923219998877	\N	Do you stitch bridal lehengas?	contact_form	NEW	\N	\N	\N	\N	\N	2026-08-29 16:20:08.707	2026-08-29 16:20:08.707
cmtel6p3n001zv3mc94lf5rzg	\N	Fatima Ali	+923331234567	\N	Any new khaddar?	contact_form	NEW	\N	\N	\N	\N	\N	2026-08-29 16:20:08.724	2026-08-29 16:20:08.724
cmtel8vuz001xv3309ia9dejt	\N	Hina Malik	+923219998877	\N	Do you stitch bridal lehengas?	contact_form	NEW	\N	\N	\N	\N	\N	2026-08-29 16:21:50.795	2026-08-29 16:21:50.795
cmtel8vvf001zv330316zv56e	\N	Fatima Ali	+923331234567	\N	Any new khaddar?	contact_form	NEW	\N	\N	\N	\N	\N	2026-08-29 16:21:50.812	2026-08-29 16:21:50.812
\.


--
-- Data for Name: MeasurementField; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."MeasurementField" (id, "garmentTypeId", key, "labelEn", "labelUr", unit, min, max, required, "order", "helpEn", "helpUr", "isActive") FROM stdin;
cmsx5remb000uv3uwtj3zvuez	cmsx5rem6000sv3uw27ole3ls	length	Shalwar length	شلوار کی لمبائی	INCH	28	50	t	1	\N	\N	t
cmsx5remf000wv3uw3s7e3gs2	cmsx5rem6000sv3uw27ole3ls	waist	Waist	کمر	INCH	22	60	t	2	\N	\N	t
cmsx5ren70017v3uwagzf0m4a	cmsx5remv0013v3uwg59rhzgv	waist	Waist	کمر	INCH	22	60	t	2	\N	\N	t
cmsx5renb0019v3uwin3zzd5p	cmsx5remv0013v3uwg59rhzgv	hips	Hips	ہپس	INCH	26	66	t	3	\N	\N	t
cmsx5renf001bv3uwy2u4tcey	cmsx5remv0013v3uwg59rhzgv	thigh	Thigh	ران	INCH	14	40	t	4	\N	\N	t
cmsx5renl001dv3uwohgvka1v	cmsx5remv0013v3uwg59rhzgv	knee	Knee	گھٹنا	INCH	10	30	f	5	\N	\N	t
cmsx5renp001fv3uwsbqdww4s	cmsx5remv0013v3uwg59rhzgv	bottom	Bottom opening	پائنچہ	INCH	8	26	t	6	\N	\N	t
cmsx5renx001iv3uw07zemtsj	cmsx5rent001gv3uwu7e5gsav	length	Kurta length	کرتے کی لمبائی	INCH	30	60	t	1	\N	\N	t
cmsx5reo1001kv3uwh4ial5yw	cmsx5rent001gv3uwu7e5gsav	chest	Chest	چھاتی	INCH	28	62	t	2	\N	\N	t
cmsx5reo6001mv3uwnerj73ha	cmsx5rent001gv3uwu7e5gsav	shoulder	Shoulder	کندھا	INCH	12	26	t	3	\N	\N	t
cmsx5reob001ov3uwcgrh6q3i	cmsx5rent001gv3uwu7e5gsav	sleeve_length	Sleeve length	آستین کی لمبائی	INCH	8	30	t	4	\N	\N	t
cmsx5reof001qv3uwvwkjc9vp	cmsx5rent001gv3uwu7e5gsav	collar	Collar / neck	کالر / گلا	INCH	12	24	t	5	\N	\N	t
cmsx5reoj001sv3uwbcr99fd3	cmsx5rent001gv3uwu7e5gsav	cuff	Cuff	کف	INCH	6	16	f	6	\N	\N	t
cmsx5reos001xv3uwebxkd6lt	cmsx5reon001tv3uw4yhfp4if	chest	Chest	چھاتی	INCH	28	62	t	2	\N	\N	t
cmsx5reow001zv3uwllvhlmso	cmsx5reon001tv3uw4yhfp4if	shoulder	Shoulder	کندھا	INCH	12	26	t	3	\N	\N	t
cmsx5reoz0021v3uw4wi0ks3y	cmsx5reon001tv3uw4yhfp4if	waist	Waist	کمر	INCH	24	60	f	4	\N	\N	t
cmsx5rep90024v3uw5z4jaz32	cmsx5rep30022v3uwxeh1yape	length	Blouse length	بلاؤز کی لمبائی	INCH	10	30	t	1	\N	\N	t
cmsx5repe0026v3uwx30nmsvy	cmsx5rep30022v3uwxeh1yape	bust	Bust	بسٹ	INCH	26	58	t	2	\N	\N	t
cmsx5repj0028v3uwrcgq2r5n	cmsx5rep30022v3uwxeh1yape	under_bust	Under bust	انڈر بسٹ	INCH	22	54	f	3	\N	\N	t
cmsx5repn002av3uw8apqsbmy	cmsx5rep30022v3uwxeh1yape	waist	Waist	کمر	INCH	22	56	t	4	\N	\N	t
cmsx5repr002cv3uwnzl4c9gm	cmsx5rep30022v3uwxeh1yape	shoulder	Shoulder	کندھا	INCH	10	24	t	5	\N	\N	t
cmsx5repw002ev3uwcvkthibz	cmsx5rep30022v3uwxeh1yape	sleeve_length	Sleeve length	آستین کی لمبائی	INCH	2	28	t	6	\N	\N	t
cmsx5req0002gv3uwj17lrox6	cmsx5rep30022v3uwxeh1yape	armhole	Armhole	بازو کا گھیر	INCH	12	28	f	7	\N	\N	t
cmtdcvbao005qv3gc3dl4jm2x	cmsx5rek50007v3uwzg0vl4hk	slit_height	Slit height	چاک کی اونچائی	INCH	0	20	f	11	How high the side slit is cut, measured up from the hem.	سائیڈ چاک دامن سے کتنی اونچائی تک کاٹا جائے۔	t
cmtdcvbau005sv3gc6l1sko85	cmsx5rek50007v3uwzg0vl4hk	daman	Daman (hem width)	دامن کی چوڑائی	INCH	20	80	f	12	Width of the bottom hem, for a flared cut.	نچلے دامن کی چوڑائی، فلیئرڈ کٹ کے لیے۔	t
cmtdcvbb1005uv3gcsavas75s	cmsx5rep30022v3uwxeh1yape	upper_bust	Upper bust	اپر بسٹ	INCH	24	56	f	8	Around the chest just above the bust line.	بسٹ لائن سے تھوڑا اوپر، سینے کے گرد۔	t
cmsx5rel7000fv3uw82yu3p6b	cmsx5rek50007v3uwzg0vl4hk	hips	Hips	ہپس	INCH	26	66	t	4	\N	\N	t
cmsx5relb000hv3uwagltn027	cmsx5rek50007v3uwzg0vl4hk	shoulder	Shoulder	کندھا	INCH	10	24	t	5	\N	\N	t
cmsx5relh000jv3uw4hfzri92	cmsx5rek50007v3uwzg0vl4hk	sleeve_length	Sleeve length	آستین کی لمبائی	INCH	4	30	t	6	\N	\N	t
cmsx5relo000lv3uwl7tql1p6	cmsx5rek50007v3uwzg0vl4hk	sleeve_opening	Sleeve opening (mohri)	آستین کا موہری	INCH	6	20	t	7	\N	\N	t
cmsx5rels000nv3uwsbd45s8q	cmsx5rek50007v3uwzg0vl4hk	armhole	Armhole	بازو کا گھیر	INCH	12	28	f	8	\N	\N	t
cmsx5relx000pv3uwy2r0okmv	cmsx5rek50007v3uwzg0vl4hk	neck_front	Front neck depth	اگلا گلا	INCH	2	18	f	9	\N	\N	t
cmsx5rem2000rv3uwzhrmosh7	cmsx5rek50007v3uwzg0vl4hk	neck_back	Back neck depth	پچھلا گلا	INCH	2	18	f	10	\N	\N	t
cmsx5remj000yv3uwjxxb8ri6	cmsx5rem6000sv3uw27ole3ls	hips	Hips	ہپس	INCH	26	66	t	3	\N	\N	t
cmsx5remo0010v3uwdqtpci2y	cmsx5rem6000sv3uw27ole3ls	thigh	Thigh	ران	INCH	14	40	f	4	\N	\N	t
cmsx5remr0012v3uwfzxmjpwt	cmsx5rem6000sv3uw27ole3ls	bottom	Bottom opening (pancha)	پائنچہ	INCH	8	26	t	5	\N	\N	t
cmsx5ren00015v3uwxqjaprd5	cmsx5remv0013v3uwg59rhzgv	length	Trouser length	ٹراؤزر کی لمبائی	INCH	28	50	t	1	\N	\N	t
cmsx5reoq001vv3uw78vreqer	cmsx5reon001tv3uw4yhfp4if	length	Waistcoat length	واسکٹ کی لمبائی	INCH	20	40	t	1	\N	\N	t
cmtdcvbb4005wv3gc4kha1sax	cmsx5rep30022v3uwxeh1yape	apex_point	Apex point (shoulder to bust point)	شانے سے بسٹ پوائنٹ تک	INCH	6	16	f	9	From the shoulder seam down to the fullest point of the bust.	شانے کی سلائی سے بسٹ کے سب سے اونچے مقام تک۔	t
cmtdcvbb8005yv3gca2u9t79j	cmsx5rep30022v3uwxeh1yape	neck_front	Front neck drop	اگلا گلا	INCH	2	14	f	10	How deep the front neckline is cut, from the collarbone.	ہنسلی کی ہڈی سے گلا کتنا گہرا کاٹا جائے۔	t
cmsx5rekx000bv3uwwbq3hunl	cmsx5rek50007v3uwzg0vl4hk	chest	Chest	چھاتی	INCH	24	60	t	2	Around the fullest part of the chest.	چھاتی کے سب سے چوڑے حصے کے گرد۔	t
cmsx5rel2000dv3uw2cddek84	cmsx5rek50007v3uwzg0vl4hk	waist	Waist	کمر	INCH	22	60	t	3	\N	\N	t
cmtdcvbbv0068v3gclvaec5ez	cmsx5remv0013v3uwg59rhzgv	back_rise	Back rise	پچھلا رائز	INCH	10	22	f	8	From the waist at the back, down through the seat to the crotch seam.	پشت پر کمر سے نیچے نشست سے ہوتے ہوئے کراچ سیم تک۔	t
cmtdcvbc4006bv3gckbkfy9wi	cmtdcvbbz0069v3gcw9lr9j4h	shoulder	Shoulder	کندھا	INCH	10	24	t	1	\N	\N	t
cmtdcvbc7006dv3gcfzddakw7	cmtdcvbbz0069v3gcw9lr9j4h	chest	Chest	چھاتی	INCH	24	60	t	2	\N	\N	t
cmtdcvbca006fv3gc3ho0dxok	cmtdcvbbz0069v3gcw9lr9j4h	waist	Waist	کمر	INCH	22	60	t	3	\N	\N	t
cmtdcvbce006hv3gcyswrl65p	cmtdcvbbz0069v3gcw9lr9j4h	bodice_length	Bodice length	بودیس کی لمبائی	INCH	8	20	t	4	From the shoulder to the waist seam where the flare begins.	شانے سے کمر کی سلائی تک جہاں سے گھیرا شروع ہوتا ہے۔	t
cmtdcvbch006jv3gcf9ajs9j5	cmtdcvbbz0069v3gcw9lr9j4h	mid_flank	Mid-flank	درمیانی گھیر	INCH	24	60	f	5	Around the body midway between waist and hip, where the panels flare out.	کمر اور ہپ کے درمیان، جہاں سے پینل پھیلنا شروع ہوں۔	t
cmtdcvbck006lv3gcdt16guql	cmtdcvbbz0069v3gcw9lr9j4h	flare_perimeter	Flare perimeter (ghera)	گھیرا	INCH	60	200	t	6	Total sweep around the bottom hem, all panels included.	نچلے دامن کا مکمل گھیر، تمام پینل ملا کر۔	t
cmtdcvbcn006nv3gcg7pfnxcm	cmtdcvbbz0069v3gcw9lr9j4h	length	Total length	مکمل لمبائی	INCH	40	62	t	7	\N	\N	t
cmtdcvbcq006pv3gcdvopk6jf	cmtdcvbbz0069v3gcw9lr9j4h	panel_count	Panel (kali) count	کلیوں کی تعداد	INCH	1	12	f	8	Number of flared panels stitched into the skirt — a count, not a measurement in inches.	اسکرٹ میں سلی گئی کلیوں کی تعداد — یہ ناپ نہیں، گنتی ہے۔	t
cmtdcvbcx006sv3gcpamo4ppn	cmtdcvbcu006qv3gc485k4nsr	shoulder	Shoulder	کندھا	INCH	10	24	t	1	\N	\N	t
cmtdcvbd0006uv3gcfyyoy03g	cmtdcvbcu006qv3gc485k4nsr	chest	Chest	چھاتی	INCH	24	60	t	2	\N	\N	t
cmtdcvbd3006wv3gcpiiugujq	cmtdcvbcu006qv3gc485k4nsr	waist	Waist	کمر	INCH	22	60	t	3	\N	\N	t
cmtdcvbd6006yv3gcmgajmhmq	cmtdcvbcu006qv3gc485k4nsr	tie_string_point	Tie-string point	ازار بند کا مقام	INCH	4	20	f	4	Where the side tie-string sits, measured down from the underarm.	بغل سے نیچے کی طرف، جہاں سائیڈ کی ڈوری باندھی جائے۔	t
cmtdcvbd90070v3gc3ici5y15	cmtdcvbcu006qv3gc485k4nsr	outer_flap_width	Outer flap width	بیرونی پلے کی چوڑائی	INCH	6	24	t	5	Width of the front flap that crosses over and ties at the side.	اگلے پلے کی چوڑائی جو سائیڈ پر کراس ہو کر بندھتا ہے۔	t
cmtdcvbdd0072v3gcj7a9pzjx	cmtdcvbcu006qv3gc485k4nsr	inner_flap_drop	Inner flap drop	اندرونی پلے کی گہرائی	INCH	4	18	f	6	How far the inner flap sits beneath the outer one.	اندرونی پلا بیرونی پلے کے نیچے کتنا رہے۔	t
cmtdcvbdg0074v3gc4q7n2sav	cmtdcvbcu006qv3gc485k4nsr	length	Total length	مکمل لمبائی	INCH	30	60	t	7	\N	\N	t
cmtdcvbdm0077v3gc47rvbp70	cmtdcvbdj0075v3gck398dved	shoulder	Shoulder	کندھا	INCH	10	24	t	1	\N	\N	t
cmtdcvbdp0079v3gce6h88ete	cmtdcvbdj0075v3gck398dved	chest	Chest	چھاتی	INCH	24	60	t	2	\N	\N	t
cmtdcvbdt007bv3gcu6ffwvrh	cmtdcvbdj0075v3gck398dved	empire_waist	Empire waist (under-bust)	انڈر بسٹ کمر	INCH	24	56	t	3	Around the body just under the bust, where the gown gathers.	بسٹ کے نیچے، جہاں سے گاؤن میں چنٹ پڑتی ہے۔	t
cmtdcvbdw007dv3gcbpxytxtx	cmtdcvbdj0075v3gck398dved	floor_length	Floor length (with heels)	فرش تک لمبائی (ہیل کے ساتھ)	INCH	50	66	t	4	Measured while wearing the heels the gown will be worn with.	وہ ہیل پہن کر ناپیں جو گاؤن کے ساتھ پہنی جائے گی۔	t
cmtdcvbdy007fv3gcvmk23hyv	cmtdcvbdj0075v3gck398dved	ghera_radius	Ghera radius	گھیرے کا رداس	INCH	20	60	f	5	How far the hem flares out from the body at the floor.	فرش کے پاس لباس جسم سے کتنا باہر تک پھیلا ہو۔	t
cmtdcvbe4007iv3gcfki1dmy0	cmtdcvbe1007gv3gcafggbfff	shoulder	Shoulder	کندھا	INCH	10	24	t	1	\N	\N	t
cmtdcvbe8007kv3gcfzirw400	cmtdcvbe1007gv3gcafggbfff	chest	Chest	چھاتی	INCH	24	60	t	2	\N	\N	t
cmtdcvbee007ov3gcx5vipfas	cmtdcvbe1007gv3gcafggbfff	hips	Hips	ہپس	INCH	26	66	t	4	\N	\N	t
cmtdcvbeh007qv3gchhfas9i6	cmtdcvbe1007gv3gcafggbfff	short_length	Short length	مختصر لمبائی	INCH	18	32	t	5	From the shoulder down to the hip-length hem.	شانے سے ہپ تک کی لمبائی تک۔	t
cmtdcvbeo007tv3gc782puy0f	cmtdcvbek007rv3gcoxtwyj5j	shoulder	Shoulder	کندھا	INCH	10	24	t	1	\N	\N	t
cmtdcvber007vv3gchnu3ee43	cmtdcvbek007rv3gcoxtwyj5j	chest	Chest	چھاتی	INCH	24	60	t	2	\N	\N	t
cmtdcvbeu007xv3gcwjjmbgwt	cmtdcvbek007rv3gcoxtwyj5j	waist	Waist	کمر	INCH	22	60	t	3	\N	\N	t
cmtdcvbey007zv3gc46t1nzb0	cmtdcvbek007rv3gcoxtwyj5j	short_length	Short length	مختصر لمبائی	INCH	16	30	t	4	\N	\N	t
cmtdcvbf10081v3gcgnzx4zv6	cmtdcvbek007rv3gcoxtwyj5j	armhole	Armhole	بازو کا گھیر	INCH	12	28	f	5	\N	\N	t
cmtdcvbbh0062v3gcddn1lk40	cmsx5rep30022v3uwxeh1yape	back_width	Back width	پشت کی چوڑائی	INCH	10	22	f	12	Straight across the back, shoulder blade to shoulder blade.	پشت پر سیدھا، دونوں کندھوں کے درمیان۔	t
cmtdcvbbs0066v3gcwbtluu84	cmsx5remv0013v3uwg59rhzgv	lower_calf	Lower calf	نچلی پنڈلی	INCH	10	22	f	7	Around the leg just above the ankle, for a fitted taper.	ایڑی کے بالکل اوپر ٹانگ کے گرد، فٹڈ تراش کے لیے۔	t
cmtdcvbeb007mv3gcg1fwop8u	cmtdcvbe1007gv3gcafggbfff	waist	Waist	کمر	INCH	22	60	t	3	\N	\N	t
cmtdcvbfv008hv3gcmhi8pp3y	cmtdcvbfr008fv3gcpu0qb2v8	true_waist	True waist (navel tie-point)	اصل کمر (ناف کی سطح)	INCH	22	52	t	1	Around the body at the navel, where the lehenga ties.	ناف کی سطح پر، جہاں لہنگا باندھا جاتا ہے۔	t
cmtdcvbfy008jv3gctoas9ng5	cmtdcvbfr008fv3gcpu0qb2v8	hips	Hips	ہپس	INCH	26	66	t	2	\N	\N	t
cmtdcvbg8008pv3gcr3eqofgc	cmtdcvbfr008fv3gcpu0qb2v8	panel_count	Panel count	پینلز کی تعداد	INCH	4	24	f	5	Number of flared panels stitched into the skirt — a count, not a measurement in inches.	اسکرٹ میں سلے گئے پینلز کی تعداد — یہ ناپ نہیں، گنتی ہے۔	t
cmtdcvbge008sv3gca75qiy76	cmtdcvbgb008qv3gc7yvagsps	tie_waist	Snug tie-waist	تنگ کمر (ازار بند)	INCH	22	50	t	1	Snug around the natural waist, where the drawstring sits.	قدرتی کمر کے گرد تنگ، جہاں ازار بند باندھا جائے۔	t
cmtdcvbgh008uv3gcgg2vc1bz	cmtdcvbgb008qv3gc7yvagsps	hips	Hips	ہپس	INCH	26	66	t	2	\N	\N	t
cmtdcvbgl008wv3gcrvdl0fpm	cmtdcvbgb008qv3gc7yvagsps	floor_length	Petticoat floor length	پیٹی کوٹ کی لمبائی (فرش تک)	INCH	30	44	t	3	\N	\N	t
cmtdcvbgr008zv3gchx10vxb7	cmtdcvbgo008xv3gcqmzi9tu1	front_full_length	Front full length	اگلی مکمل لمبائی	INCH	48	64	t	1	From the shoulder straight down to the floor at the front.	شانے سے سیدھا فرش تک، اگلی طرف سے۔	t
cmtdcvbgu0091v3gc66iocs08	cmtdcvbgo008xv3gcqmzi9tu1	chest	Chest	چھاتی	INCH	24	60	t	2	\N	\N	t
cmtdcvbgx0093v3gccree3azh	cmtdcvbgo008xv3gcqmzi9tu1	natural_waist	Natural waist	قدرتی کمر	INCH	22	56	t	3	\N	\N	t
cmtdcvbh20095v3gc8re59ez8	cmtdcvbgo008xv3gcqmzi9tu1	shoulder	Shoulder	کندھا	INCH	10	24	t	4	\N	\N	t
cmtdcvbhe009av3gc4s32h3ou	cmtdcvbh90098v3gcrbzlv38a	oversized_chest	Oversized chest	کشادہ سینہ	INCH	32	70	t	1	Chest measurement with generous ease for a loose, flowing fit.	ڈھیلے فٹ کے لیے سینے کا ناپ اضافی گنجائش کے ساتھ۔	t
cmtdcvbhl009cv3gcwsb4z3hf	cmtdcvbh90098v3gcrbzlv38a	over_shoulder_span	Over-shoulder span	کندھوں کا کل پھیلاؤ	INCH	14	28	t	2	Straight across the back from one shoulder drop point to the other.	ایک کندھے سے دوسرے کندھے تک، پشت پر سیدھا۔	t
cmtdcvbho009ev3gct3v3dqqq	cmtdcvbh90098v3gcrbzlv38a	total_maxi_length	Total maxi length	مکمل لمبائی	INCH	50	66	t	3	\N	\N	t
cmtdcvbhr009gv3gcy9exjtbh	cmtdcvbh90098v3gcrbzlv38a	wide_wrist	Wide wrist (for easy rolling)	کشادہ کلائی (آسانی سے موڑنے کے لیے)	INCH	8	20	f	4	Sleeve opening at the wrist, kept loose for rolling up.	کلائی پر آستین کا کھلا حصہ، موڑنے کے لیے ڈھیلا رکھا جائے۔	t
cmtdcvbi0009jv3gcpv5d029d	cmtdcvbhw009hv3gc1jho2v1e	waist	Waist	کمر	INCH	22	60	t	1	\N	\N	t
cmtdcvbi3009lv3gcsxf9cmy3	cmtdcvbhw009hv3gc1jho2v1e	outseam_length	Outseam length	باہری لمبائی	INCH	28	50	t	2	From the waist down the outer leg to the ankle.	کمر سے ٹانگ کے باہری حصے سے ہوتے ہوئے ایڑی تک۔	t
cmtdcvbi7009nv3gcel92dz4g	cmtdcvbhw009hv3gc1jho2v1e	paincha	Paincha (ankle cuff) width	پائنچہ کی چوڑائی	INCH	8	30	t	3	The gathered cuff at the ankle — Patiala paincha is cut wide for its signature folds.	ایڑی پر چنٹ دار پائنچہ — پٹیالہ کا پائنچہ اپنی مخصوص سلوٹوں کے لیے کشادہ رکھا جاتا ہے۔	t
cmtdcvbif009qv3gccgtrduwo	cmtdcvbia009ov3gcy1e8o8g7	waist	Waist	کمر	INCH	22	60	t	1	\N	\N	t
cmtdcvbij009sv3gczei51tif	cmtdcvbia009ov3gcy1e8o8g7	thigh_round	Thigh round	ران کا گھیر	INCH	14	40	t	2	\N	\N	t
cmtdcvbil009uv3gc4crkw21p	cmtdcvbia009ov3gcy1e8o8g7	upper_calf	Upper calf	اوپری پنڈلی	INCH	10	24	f	3	\N	\N	t
cmtdcvbiy00a1v3gcuq3z7005	cmtdcvbiv009zv3gcgnwnr883	waist	Waist	کمر	INCH	22	60	t	1	\N	\N	t
cmtdcvbj100a3v3gcf83oj858	cmtdcvbiv009zv3gcgnwnr883	hips	Hips	ہپس	INCH	26	66	t	2	\N	\N	t
cmtdcvbfb0086v3gcjnwkon8n	cmtdcvbf80084v3gc0v3dy7lt	shoulder	Shoulder	کندھا	INCH	10	24	t	1	\N	\N	t
cmtdcvbfe0088v3gcr645kq0u	cmtdcvbf80084v3gc0v3dy7lt	chest	Chest	چھاتی	INCH	24	60	t	2	\N	\N	t
cmtdcvbfh008av3gct3c62661	cmtdcvbf80084v3gc0v3dy7lt	waist	Waist	کمر	INCH	22	60	t	3	\N	\N	t
cmtdcvbfk008cv3gc24zatwmy	cmtdcvbf80084v3gc0v3dy7lt	length	Total length	مکمل لمبائی	INCH	30	55	t	4	\N	\N	t
cmtdcvbfp008ev3gcq4qm9s9q	cmtdcvbf80084v3gc0v3dy7lt	daman	Daman (hem width)	دامن کی چوڑائی	INCH	26	70	t	5	Width of the flared bottom hem.	نچلے پھیلے ہوئے دامن کی چوڑائی۔	t
cmtdcvbg5008nv3gczudbzvj3	cmtdcvbfr008fv3gcpu0qb2v8	flare_width	Flare width (ghera)	گھیرا	INCH	80	250	t	4	Total sweep around the bottom hem.	نچلے دامن کا مکمل گھیر۔	t
cmtdcvbh50097v3gcwydck1kv	cmtdcvbgo008xv3gcqmzi9tu1	sleeve_length	Sleeve length	آستین کی لمبائی	INCH	4	30	f	5	\N	\N	t
cmtdcvbio009wv3gczdkczbod	cmtdcvbia009ov3gcy1e8o8g7	lower_calf	Lower calf	نچلی پنڈلی	INCH	8	20	f	4	\N	\N	t
cmtdcvbk100alv3gcyhzm6jhi	cmtdcvbjv00ahv3gcbcyvnilw	hips	Hips	ہپس	INCH	26	66	t	2	\N	\N	t
cmtdcvbk400anv3gcwvbe471d	cmtdcvbjv00ahv3gcbcyvnilw	thigh_girth	Thigh girth (goot)	ران کا گھیر (گوٹ)	INCH	14	44	t	3	The precise thigh girth where the upper leg panel is cut close before flaring below the knee.	ران کا درست گھیر جہاں گھٹنے سے نیچے پھیلاؤ سے پہلے اوپری ٹانگ کا پینل قریب سے کاٹا جاتا ہے۔	t
cmtdcvbk800apv3gcnh23c45v	cmtdcvbjv00ahv3gcbcyvnilw	knee_height	Knee height (waist to above kneecap)	گھٹنے کی اونچائی (کمر سے گھٹنے کے اوپر تک)	INCH	14	28	t	4	From the waist down to just above the kneecap, where the ruched joint sits.	کمر سے نیچے گھٹنے کی ٹوپی کے بالکل اوپر تک، جہاں روچڈ جوڑ رکھا جاتا ہے۔	t
cmtdcvbkc00arv3gckw9vpd99	cmtdcvbjv00ahv3gcbcyvnilw	flare_hem	Lower flare hem circumference	نچلے گھیرے کا طواف	INCH	60	200	t	5	Total sweep around the bottom hem, below the knee joint.	گھٹنے کے جوڑ سے نیچے، نچلے دامن کا مکمل گھیر۔	t
cmtdcvbke00atv3gcqm1w8tl7	cmtdcvbjv00ahv3gcbcyvnilw	length	Total length	مکمل لمبائی	INCH	34	48	t	6	\N	\N	t
cmtdcvbkk00awv3gc44bhk32g	cmtdcvbkh00auv3gccscv50wt	high_waist	High waist	اونچی کمر	INCH	22	56	t	1	\N	\N	t
cmtdcvbkr00b0v3gc1j39qh05	cmtdcvbkh00auv3gccscv50wt	total_outseam	Total outseam	کل باہری لمبائی	INCH	28	50	t	3	\N	\N	t
cmtdcvbku00b2v3gcz1j0ji8a	cmtdcvbkh00auv3gccscv50wt	leg_flare_width	Leg flare width	ٹانگ کے گھیرے کی چوڑائی	INCH	20	80	t	4	Width of each individual leg at its widest point — each leg flares like its own divided skirt panel.	ہر ٹانگ کے سب سے چوڑے مقام کی چوڑائی — ہر ٹانگ اپنے علیحدہ اسکرٹ پینل کی طرح پھیلتی ہے۔	t
cmsx5rekj0009v3uwyjt1ez5b	cmsx5rek50007v3uwzg0vl4hk	length	Kameez length	قمیض کی لمبائی	INCH	24	60	t	1	From shoulder seam down to the desired hem.	کندھے سے مطلوبہ لمبائی تک۔	t
cmtdcvbba0060v3gc45qbws6x	cmsx5rep30022v3uwxeh1yape	neck_back	Back neck drop	پچھلا گلا	INCH	2	16	f	11	How deep the back neckline is cut.	پشت پر گلا کتنا گہرا کاٹا جائے۔	t
cmtdcvbbm0064v3gcdp7tgxcv	cmsx5rem6000sv3uw27ole3ls	crotch_depth	Crotch depth (asan)	آسن کی گہرائی	INCH	6	18	f	6	From the waist down through the crotch — the traditional asan measurement that sets how loose the seat sits.	کمر سے نیچے دونوں ٹانگوں کے درمیان تک — روایتی آسن کا ناپ جو نشست کی کھلاؤ طے کرتا ہے۔	t
cmtdcvbf40083v3gcl1qswve7	cmtdcvbek007rv3gcoxtwyj5j	center_front_length	Center front length	اگلے سینٹر کی لمبائی	INCH	14	34	f	6	From the base of the neck straight down the center front to the hem.	گلے کی بنیاد سے سیدھا نیچے دامن تک، سینٹر فرنٹ پر۔	t
cmtdcvbg1008lv3gcxi2ltch4	cmtdcvbfr008fv3gcpu0qb2v8	floor_length	Floor length (with event shoes)	فرش تک لمبائی (تقریب کے جوتوں کے ساتھ)	INCH	34	46	t	3	Measured while wearing the shoes the lehenga will be worn with.	وہ جوتے پہن کر ناپیں جو تقریب میں پہنے جائیں گے۔	t
cmtdcvbis009yv3gcpgl4cfg8	cmtdcvbia009ov3gcy1e8o8g7	ankle_round	Ankle round	ایڑی کا گھیر	INCH	6	16	t	5	Snug around the ankle bone. The finished leg is cut about 8-10 inches longer than your leg length and bunched into the signature churidar rings, so this is a fit measurement, not the fabric length.	ٹخنے کے گرد تنگ ناپ۔ مکمل ٹانگ آپ کی اصل لمبائی سے تقریباً 8-10 انچ زیادہ لمبی کاٹی جاتی ہے اور چوڑی دار کی مخصوص چوڑیوں کی صورت میں جمع کی جاتی ہے، اس لیے یہ فٹ کا ناپ ہے، کپڑے کی لمبائی نہیں۔	t
cmtdcvbj500a5v3gc24p8a0v1	cmtdcvbiv009zv3gcgnwnr883	outseam_length	Outseam length	باہری لمبائی	INCH	28	50	t	3	\N	\N	t
cmtdcvbj900a7v3gceofclzcm	cmtdcvbiv009zv3gcgnwnr883	calf_width	Calf width	پنڈلی کی چوڑائی	INCH	10	24	f	4	Around the widest point of the draped petal overlap, at calf height.	پنڈلی کی سطح پر، پیٹل کی اوورلیپ کے سب سے چوڑے مقام کے گرد۔	t
cmtdcvbje00a9v3gcaxgc402d	cmtdcvbiv009zv3gcgnwnr883	ankle_opening	Ankle opening	ایڑی کا کھلاؤ	INCH	6	18	t	5	\N	\N	t
cmtdcvbjk00acv3gcgg24gk67	cmtdcvbjh00aav3gcycbsp1dy	waist	Waist	کمر	INCH	22	60	t	1	\N	\N	t
cmtdcvbjn00aev3gcaa4q3tre	cmtdcvbjh00aav3gcycbsp1dy	thigh_round	Thigh round (loose)	ران کا گھیر (ڈھیلا)	INCH	14	44	f	2	Taken with generous ease — the dhoti drape needs extra room to fall in loose curved folds.	اضافی گنجائش کے ساتھ ناپیں — دھوتی کی ڈریپ کو ڈھیلے خمدار سلوٹوں میں گرنے کے لیے مزید جگہ چاہیے۔	t
cmtdcvbjr00agv3gc25mtcz4j	cmtdcvbjh00aav3gcycbsp1dy	outseam_length	Outseam length	باہری لمبائی	INCH	28	50	t	3	\N	\N	t
cmtdcvbjy00ajv3gc299qjpi8	cmtdcvbjv00ahv3gcbcyvnilw	high_waist	High waist	اونچی کمر	INCH	22	56	t	1	\N	\N	t
cmtdcvbkn00ayv3gcg8npyycy	cmtdcvbkh00auv3gccscv50wt	hips	Hips	ہپس	INCH	26	66	t	2	\N	\N	t
\.


--
-- Data for Name: MeasurementProfile; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."MeasurementProfile" (id, "userId", "garmentTypeId", label, "values", notes, "isDefault", "createdAt", "updatedAt") FROM stdin;
cmsx5rfdh007ov3uwh7pu18np	cmsx5rehl0005v3uwdwy4jud8	cmsx5rek50007v3uwzg0vl4hk	Self	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}	\N	t	2026-08-17 11:36:17.045	2026-08-28 23:11:56.45
cmsx5rfe3007qv3uw4hlexvmi	cmsx5rehl0005v3uwdwy4jud8	cmsx5rem6000sv3uw27ole3ls	Self	{"hips": 42, "waist": 34, "bottom": 14, "length": 40}	\N	t	2026-08-17 11:36:17.067	2026-08-28 23:11:56.458
\.


--
-- Data for Name: Order; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Order" (id, number, "userId", "contactId", status, currency, "guestName", "guestEmail", "guestPhone", "shippingAddress", "billingAddress", "itemsSubtotal", "stitchingSubtotal", "itemDiscountTotal", "orderDiscount", "shippingFee", "codFee", "grandTotal", "shippingZone", "customerNote", "staffNote", "cancelReason", "placedAt", "confirmedAt", "deliveredAt", "cancelledAt", "createdAt", "updatedAt") FROM stdin;
cmsxjvk0f000bv3ug56i6yywp	YSN-2026-0001	\N	cmsxjvlhj000kv3ugqnox2mgh	DELIVERED	PKR	ali	nommimalik308@gmail.com	+923089270737	{"city": "Rohillanwali", "line1": "kjdfnjbjbgb", "line2": "vnn", "phone": "+923089270737", "fullName": "ali", "province": "Punjab", "postalCode": "34400"}	\N	770000	325000	0	0	0	10000	1105000	rest_of_pakistan	nk jjjj klf 	\N	\N	2026-08-17 18:11:24.292	2026-08-17 18:16:12.93	2026-08-17 18:16:37.545	\N	2026-08-17 18:11:24.292	2026-08-17 18:16:37.548
\.


--
-- Data for Name: OrderItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."OrderItem" (id, "orderId", "productId", "variantId", kind, "nameEn", "nameUr", sku, "imageUrl", "variantLabel", "unitPrice", quantity, "stitchingFeeUnit", "discountUnit", "lineTotal", "stitchingServiceId", "stitchingServiceName", "garmentTypeKey", "measurementSnapshot", "optionsSnapshot", "stitchingNotes", "createdAt", "measurementValues", "customDesignText", "sizeToken", "unitCost") FROM stdin;
cmsxjvk0n000dv3ugbshx5zv5	cmsxjvk0f000bv3ug56i6yywp	cmsx5rf560060v3uww4d8aqk4	cmsx5rf5m0066v3uwsl6l4ag9	UNSTITCHED	Men's Wash & Wear 2-Piece — Grey	مردانہ واش اینڈ ویئر ٹو پیس — سرمئی	MENS-WASH-N-WEAR-2-PIECE-GREY-GREY-FREE-SIZE	/placeholders/washnwear-grey.svg	Free size / Grey	320000	1	0	0	320000	\N	\N	\N	null	null	\N	2026-08-17 18:11:24.292	\N	\N	\N	0
cmsxjvk0n000ev3ugrzxurlzb	cmsxjvk0f000bv3ug56i6yywp	cmsx5rewv004cv3uwtt13zsn2	cmsx5rexv004iv3uwhtv4yelr	UNSTITCHED	3-Piece Embroidered Lawn Suit — Ferozi	تھری پیس کڑھائی والا لان سوٹ — فیروزی	EMBROIDERED-LAWN-3-PIECE-FEROZI-FEROZI-FREE-SIZE	/placeholders/lawn-ferozi.svg	Free size / Ferozi	450000	1	325000	0	775000	cmsx5rf8h006kv3uw3x2zmbsl	Kameez Stitching — Premium	kameez	{"label": "Self", "values": {"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}, "garmentTypeKey": "kameez"}	[{"key": "cuffed", "labelEn": "Cuffed", "labelUr": "کف والی", "groupKey": "sleeve_style", "priceDelta": 20000, "groupLabelEn": "Sleeve style", "groupLabelUr": "آستین"}, {"key": "lining", "labelEn": "Full lining", "labelUr": "مکمل استر", "groupKey": "kameez_finish", "priceDelta": 40000, "groupLabelEn": "Finishing", "groupLabelUr": "فنشنگ"}, {"key": "boat", "labelEn": "Boat", "labelUr": "بوٹ", "groupKey": "neckline", "priceDelta": 15000, "groupLabelEn": "Neckline", "groupLabelUr": "گلا"}]	\N	2026-08-17 18:11:24.292	\N	\N	\N	0
\.


--
-- Data for Name: OrderStatusEvent; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."OrderStatusEvent" (id, "orderId", "fromStatus", "toStatus", note, "actorId", "createdAt") FROM stdin;
cmsxjvk0n000fv3ug0tm3n20r	cmsxjvk0f000bv3ug56i6yywp	\N	PENDING	Order placed	\N	2026-08-17 18:11:24.292
cmsxk1qqi000bv3z41wr2xch8	cmsxjvk0f000bv3ug56i6yywp	PENDING	CONFIRMED	\N	cmsx5rcwn0000v3uwukkiufkd	2026-08-17 18:16:12.952
cmsxk1xdq000gv3z4vk9bnyd7	cmsxjvk0f000bv3ug56i6yywp	CONFIRMED	PROCESSING	\N	cmsx5rcwn0000v3uwukkiufkd	2026-08-17 18:16:21.567
cmsxk20mi000lv3z4niofi3xh	cmsxjvk0f000bv3ug56i6yywp	PROCESSING	READY_TO_SHIP	\N	cmsx5rcwn0000v3uwukkiufkd	2026-08-17 18:16:25.77
cmsxk26kg000qv3z4ozswiebh	cmsxjvk0f000bv3ug56i6yywp	READY_TO_SHIP	SHIPPED	\N	cmsx5rcwn0000v3uwukkiufkd	2026-08-17 18:16:33.472
cmsxk29pt000vv3z4r0neq34p	cmsxjvk0f000bv3ug56i6yywp	SHIPPED	DELIVERED	\N	cmsx5rcwn0000v3uwukkiufkd	2026-08-17 18:16:37.553
\.


--
-- Data for Name: OutboxEvent; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."OutboxEvent" (id, name, payload, status, attempts, "lastError", "availableAt", "processedAt", "createdAt") FROM stdin;
cmsxjvk57000iv3ug2558dtji	order.placed	{"userId": null, "orderId": "cmsxjvk0f000bv3ug56i6yywp", "placedAt": "2026-08-17T18:11:24.292Z", "grandTotal": 1105000, "orderNumber": "YSN-2026-0001", "customerName": "ali", "customerEmail": "nommimalik308@gmail.com", "customerPhone": "+923089270737", "stitchingItemIds": ["cmsxjvk0n000ev3ugrzxurlzb"]}	DONE	0	\N	2026-08-17 18:11:24.475	2026-08-17 18:11:26.299	2026-08-17 18:11:24.475
cmsxjvlj7000ov3ugiouwo1vl	stitching.job_created	{"jobId": "cmsxjvli6000mv3ugt9uc330a", "orderId": "cmsxjvk0f000bv3ug56i6yywp", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0001", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-17 18:11:26.275	2026-08-17 18:11:28.099	2026-08-17 18:11:26.275
cmsxk1qqs000cv3z4aon84xkb	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmsxjvk0f000bv3ug56i6yywp", "toStatus": "CONFIRMED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0001"}	DONE	0	\N	2026-08-17 18:16:12.964	2026-08-17 18:16:14.962	2026-08-17 18:16:12.964
cmt3hu0fu000jv3wchk0rhrqs	stitching.job_created	{"jobId": "cmt3hu0fg000hv3wc73zigj1g", "orderId": "cmt3hu0dh0009v3wcmcdg8f2v", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0002", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-21 22:00:50.106	2026-08-21 22:00:50.158	2026-08-21 22:00:50.106
cmsxk1xdt000hv3z4ik62f8tp	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmsxjvk0f000bv3ug56i6yywp", "toStatus": "PROCESSING", "fromStatus": "CONFIRMED", "orderNumber": "YSN-2026-0001"}	DONE	0	\N	2026-08-17 18:16:21.569	2026-08-17 18:16:22.984	2026-08-17 18:16:21.569
cmtdd5wlx001iv3xw5vst7wcw	stitching.job_created	{"jobId": "cmtdd5wiy001gv3xwjihzzp0c", "orderId": "cmtdd5wfa0014v3xwze30p0xq", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0002", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-28 19:47:48.694	2026-08-28 19:47:48.766	2026-08-28 19:47:48.694
cmtdd5whn001ev3xwnl7gmg7f	order.placed	{"userId": "cmsx5rehl0005v3uwdwy4jud8", "orderId": "cmtdd5wfa0014v3xwze30p0xq", "placedAt": "2026-08-28T19:47:48.454Z", "grandTotal": 580000, "orderNumber": "YSN-2026-0002", "customerName": "Sana Iqbal", "customerEmail": null, "customerPhone": "+923445556666", "stitchingItemIds": ["cmtdd5wfb0016v3xwi86ns6yi"]}	DONE	0	\N	2026-08-28 19:47:48.751	2026-08-28 19:47:48.782	2026-08-28 19:47:48.54
cmsxk20ml000mv3z4x53aogjx	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmsxjvk0f000bv3ug56i6yywp", "toStatus": "READY_TO_SHIP", "fromStatus": "PROCESSING", "orderNumber": "YSN-2026-0001"}	DONE	0	\N	2026-08-17 18:16:25.773	2026-08-17 18:16:26.977	2026-08-17 18:16:25.773
cmt3hu0ee000fv3wct17wnkip	order.placed	{"userId": "cmsx5rehl0005v3uwdwy4jud8", "orderId": "cmt3hu0dh0009v3wcmcdg8f2v", "placedAt": "2026-08-21T22:00:50.021Z", "grandTotal": 580000, "orderNumber": "YSN-2026-0002", "customerName": "Sana Iqbal", "customerEmail": null, "customerPhone": "+923445556666", "stitchingItemIds": ["cmt3hu0dh000bv3wc7mtzqmfa"]}	DONE	0	\N	2026-08-21 22:00:56.298	2026-08-21 22:00:56.494	2026-08-21 22:00:50.054
cmsxk26kj000rv3z4in0i5bjg	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmsxjvk0f000bv3ug56i6yywp", "toStatus": "SHIPPED", "fromStatus": "READY_TO_SHIP", "orderNumber": "YSN-2026-0001"}	DONE	0	\N	2026-08-17 18:16:33.475	2026-08-17 18:16:35	2026-08-17 18:16:33.475
cmsxk29pw000wv3z4c3of58na	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmsxjvk0f000bv3ug56i6yywp", "toStatus": "DELIVERED", "fromStatus": "SHIPPED", "orderNumber": "YSN-2026-0001"}	DONE	0	\N	2026-08-17 18:16:37.556	2026-08-17 18:16:39.022	2026-08-17 18:16:37.556
cmt3hu5in003bv3wcmot6xyvk	order.placed	{"userId": null, "orderId": "cmt3hu5hv0035v3wcwjbykevu", "placedAt": "2026-08-21T22:00:56.659Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0004", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:56.687	2026-08-21 22:00:56.707	2026-08-21 22:00:56.687
cmt3hspns001tv32o3t2ev1v3	user.registered	{"name": "Merge", "email": "merge-1787349588836@example.com", "phone": null, "userId": "cmt3hspnl001sv32o60dftlxn"}	DONE	0	\N	2026-08-21 21:59:49.48	2026-08-21 21:59:49.66	2026-08-21 21:59:49.48
cmtdd5wyk0023v3xwuseibxo2	stitching.job_stage_changed	{"jobId": "cmtdd5wiy001gv3xwjihzzp0c", "orderId": "cmtdd5wfa0014v3xwze30p0xq", "toStage": "CUTTING", "fromStage": "RECEIVED", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-28 19:47:49.148	2026-08-28 19:47:49.987	2026-08-28 19:47:49.148
cmt3hu5kh003ev3wccldkba87	order.cancelled	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmt3hu5hv0035v3wcwjbykevu", "toStatus": "CANCELLED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0004"}	DONE	0	\N	2026-08-21 22:00:56.754	2026-08-21 22:00:56.776	2026-08-21 22:00:56.754
cmtdd5wzm0028v3xw3s0ls60u	stitching.job_stage_changed	{"jobId": "cmtdd5wiy001gv3xwjihzzp0c", "orderId": "cmtdd5wfa0014v3xwze30p0xq", "toStage": "STITCHING", "fromStage": "CUTTING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-28 19:47:49.187	2026-08-28 19:47:49.998	2026-08-28 19:47:49.187
cmt3htbzm000dv3mo2w3pumii	order.placed	{"userId": null, "orderId": "cmt3htbyn0007v3mol7b65p7j", "placedAt": "2026-08-21T22:00:18.383Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0002", "customerName": "Ayesha Khan", "customerEmail": "ayesha@example.com", "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:18.418	2026-08-21 22:00:19.846	2026-08-21 22:00:18.418
cmt3htc26000pv3moqv84cjwc	order.placed	{"userId": null, "orderId": "cmt3htc1m000jv3mo9vfbrzzj", "placedAt": "2026-08-21T22:00:18.490Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0003", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:18.511	2026-08-21 22:00:19.871	2026-08-21 22:00:18.511
cmtdd5xnx002tv3xwr44m8y6s	stitching.job_stage_changed	{"jobId": "cmtdd5wiy001gv3xwjihzzp0c", "orderId": "cmtdd5wfa0014v3xwze30p0xq", "toStage": "READY", "fromStage": "QC", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-28 19:47:50.061	2026-08-28 19:47:50.084	2026-08-28 19:47:50.061
cmt3hupmm0086v3wcj8pg9vnx	order.placed	{"userId": null, "orderId": "cmt3huplu0080v3wch3m7x69o", "placedAt": "2026-08-21T22:01:22.722Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0002", "customerName": "Ayesha Khan", "customerEmail": "ayesha@example.com", "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:01:22.751	2026-08-21 22:01:24.083	2026-08-21 22:01:22.751
cmt3hupoq008iv3wclbmavzsh	order.placed	{"userId": null, "orderId": "cmt3hupob008cv3wcvxavqrbn", "placedAt": "2026-08-21T22:01:22.811Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0003", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:01:22.826	2026-08-21 22:01:24.106	2026-08-21 22:01:22.826
cmt3hupqo008uv3wcq1lyxtx6	order.placed	{"userId": null, "orderId": "cmt3hupq9008ov3wcam9df2el", "placedAt": "2026-08-21T22:01:22.881Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0004", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:01:22.896	2026-08-21 22:01:24.127	2026-08-21 22:01:22.896
cmtdd7cej00luv3xwmsqp9ttd	user.registered	{"name": "Merge", "email": "merge-1787946534984@example.com", "phone": null, "userId": "cmtdd7cee00ltv3xwc2bc89ad"}	DONE	0	\N	2026-08-28 19:48:55.82	2026-08-28 19:49:11.856	2026-08-28 19:48:55.82
cmtdd5wsi001yv3xwgixiwc0h	order.placed	{"userId": null, "orderId": "cmtdd5wr6001ov3xwq5hytdzi", "placedAt": "2026-08-28T19:47:48.882Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0003", "customerName": "Sana Iqbal", "customerEmail": null, "customerPhone": "+923445556666", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:48.93	2026-08-28 19:47:48.969	2026-08-28 19:47:48.93
cmtdd5x0v002dv3xw2wy5epbp	stitching.job_stage_changed	{"jobId": "cmtdd5wiy001gv3xwjihzzp0c", "orderId": "cmtdd5wfa0014v3xwze30p0xq", "toStage": "QC", "fromStage": "STITCHING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-28 19:47:49.231	2026-08-28 19:47:50.007	2026-08-28 19:47:49.231
cmtdd5x2k002iv3xwummaxmf2	stitching.job_stage_changed	{"jobId": "cmtdd5wiy001gv3xwjihzzp0c", "orderId": "cmtdd5wfa0014v3xwze30p0xq", "toStage": "STITCHING", "fromStage": "QC", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-28 19:47:49.293	2026-08-28 19:47:50.019	2026-08-28 19:47:49.293
cmtel4zip006pv32ssi3ldc9s	order.placed	{"userId": null, "orderId": "cmtel4zhd006fv32s08edjoa4", "placedAt": "2026-08-29T16:18:48.865Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0015", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:48.914	2026-08-29 16:18:49.992	2026-08-29 16:18:48.914
cmtel4zvb008jv32s0r90nwxi	order.placed	{"userId": null, "orderId": "cmtel4ztz0084v32s1gx5mpd7", "placedAt": "2026-08-29T16:18:49.319Z", "grandTotal": 740000, "orderNumber": "YSN-2026-0018", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:49.368	2026-08-29 16:18:50.02	2026-08-29 16:18:49.368
cmt3hu0rv0012v3wcvxhbgr7r	stitching.job_stage_changed	{"jobId": "cmt3hu0fg000hv3wc73zigj1g", "orderId": "cmt3hu0dh0009v3wcmcdg8f2v", "toStage": "CUTTING", "fromStage": "RECEIVED", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-21 22:00:50.539	2026-08-21 22:00:51.382	2026-08-21 22:00:50.539
cmt3hu0su0017v3wchcbln0pq	stitching.job_stage_changed	{"jobId": "cmt3hu0fg000hv3wc73zigj1g", "orderId": "cmt3hu0dh0009v3wcmcdg8f2v", "toStage": "STITCHING", "fromStage": "CUTTING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-21 22:00:50.575	2026-08-21 22:00:51.39	2026-08-21 22:00:50.575
cmt3htc4e0011v3mopj0no28r	order.placed	{"userId": null, "orderId": "cmt3htc3z000vv3mob98t7blz", "placedAt": "2026-08-21T22:00:18.575Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0004", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:18.591	2026-08-21 22:00:19.896	2026-08-21 22:00:18.591
cmt3htc6w001dv3mo7faws6kd	order.placed	{"userId": null, "orderId": "cmt3htc6g0017v3mojt435pnl", "placedAt": "2026-08-21T22:00:18.665Z", "grandTotal": 334900, "orderNumber": "YSN-2026-0005", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:18.68	2026-08-21 22:00:19.919	2026-08-21 22:00:18.68
cmt3htc92001pv3mo75txcl82	order.placed	{"userId": null, "orderId": "cmt3htc8l001jv3mowvbsp12j", "placedAt": "2026-08-21T22:00:18.741Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0006", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:18.758	2026-08-21 22:00:19.94	2026-08-21 22:00:18.758
cmt3htcb90021v3moi7sw9yo4	order.placed	{"userId": null, "orderId": "cmt3htcau001vv3moas1srzp6", "placedAt": "2026-08-21T22:00:18.822Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0007", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:18.838	2026-08-21 22:00:19.976	2026-08-21 22:00:18.838
cmt3htcdp002dv3moddfgzux5	order.placed	{"userId": null, "orderId": "cmt3htcdc0027v3mo566lhu1k", "placedAt": "2026-08-21T22:00:18.912Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0008", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:18.926	2026-08-21 22:00:20.006	2026-08-21 22:00:18.926
cmt3htcfv002pv3mok99trjha	order.placed	{"userId": null, "orderId": "cmt3htcfh002jv3mo8z744nae", "placedAt": "2026-08-21T22:00:18.989Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0009", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:19.003	2026-08-21 22:00:20.026	2026-08-21 22:00:19.003
cmt3htchv0031v3mo55s0xun0	order.placed	{"userId": null, "orderId": "cmt3htchj002vv3mogy63xmpt", "placedAt": "2026-08-21T22:00:19.063Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0010", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:19.076	2026-08-21 22:00:20.05	2026-08-21 22:00:19.076
cmt3hu0mk000vv3wc6mr5u54s	order.placed	{"userId": null, "orderId": "cmt3hu0lt000pv3wce2g51plo", "placedAt": "2026-08-21T22:00:50.321Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0003", "customerName": "Sana Iqbal", "customerEmail": null, "customerPhone": "+923445556666", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:56.298	2026-08-21 22:00:56.513	2026-08-21 22:00:50.348
cmtel517x00aiv32s9x3dr6es	payment.awaiting_approval	{"amount": 314900, "status": "AWAITING_APPROVAL", "orderId": "cmtel517300a8v32sz3lkr6t9", "provider": "bank_transfer", "paymentId": "cmtel517v00ahv32sb9rrssva"}	DONE	0	\N	2026-08-29 16:18:51.118	2026-08-29 16:18:51.668	2026-08-29 16:18:51.118
cmt3htdbm003rv3mog9uxo7ho	order.placed	{"userId": "cmsx5rehl0005v3uwdwy4jud8", "orderId": "cmt3htdav003lv3mo4trxszsv", "placedAt": "2026-08-21T22:00:20.118Z", "grandTotal": 580000, "orderNumber": "YSN-2026-0011", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": ["cmt3htdav003nv3mofrpvkatp"]}	DONE	0	\N	2026-08-21 22:00:20.147	2026-08-21 22:00:21.742	2026-08-21 22:00:20.147
cmt3htdem0043v3moucx4nojq	order.placed	{"userId": null, "orderId": "cmt3htde5003xv3mocomy6z90", "placedAt": "2026-08-21T22:00:20.237Z", "grandTotal": 550000, "orderNumber": "YSN-2026-0012", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": ["cmt3htde5003zv3moyo6a1hz1"]}	DONE	0	\N	2026-08-21 22:00:20.254	2026-08-21 22:00:21.79	2026-08-21 22:00:20.254
cmt3hte2y004nv3mo5x4rt7fz	payment.succeeded	{"amount": 314900, "status": "PAID", "orderId": "cmt3hte0x004fv3mo9v1qy5x0", "provider": "bank_transfer", "paymentId": "cmt3hte1b004kv3mobkgwkjtz"}	DONE	0	\N	2026-08-21 22:00:21.131	2026-08-21 22:00:21.793	2026-08-21 22:00:21.131
cmt3htege006jv3mo7x5ijn1t	stitching.job_created	{"jobId": "cmt3htefv006hv3morepfn2yf", "orderId": "cmt3htdav003lv3mo4trxszsv", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0002", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-21 22:00:21.614	2026-08-21 22:00:49.73	2026-08-21 22:00:21.614
cmt3htel20074v3mozkpgnd1k	stitching.job_created	{"jobId": "cmt3hteks0072v3moy84jcyfj", "orderId": "cmt3htde5003xv3mocomy6z90", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0003", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-21 22:00:21.783	2026-08-21 22:00:49.734	2026-08-21 22:00:21.783
cmtdd5xmi002ov3xwlfn2jplh	stitching.job_stage_changed	{"jobId": "cmtdd5wiy001gv3xwjihzzp0c", "orderId": "cmtdd5wfa0014v3xwze30p0xq", "toStage": "QC", "fromStage": "STITCHING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-28 19:47:50.011	2026-08-28 19:47:50.094	2026-08-28 19:47:50.011
cmtdd5xrp0030v3xwcwu0q02u	stitching.order_created	{"number": "STO-2026-0001", "stitchingOrderId": "cmtdd5xre002xv3xw37ajvx3u"}	DONE	0	\N	2026-08-28 19:47:50.198	2026-08-28 19:47:55.961	2026-08-28 19:47:50.198
cmt3hu0tv001cv3wce18n3bhp	stitching.job_stage_changed	{"jobId": "cmt3hu0fg000hv3wc73zigj1g", "orderId": "cmt3hu0dh0009v3wcmcdg8f2v", "toStage": "QC", "fromStage": "STITCHING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-21 22:00:50.612	2026-08-21 22:00:51.398	2026-08-21 22:00:50.612
cmt3hu0vg001hv3wc3o9qw5o2	stitching.job_stage_changed	{"jobId": "cmt3hu0fg000hv3wc73zigj1g", "orderId": "cmt3hu0dh0009v3wcmcdg8f2v", "toStage": "STITCHING", "fromStage": "QC", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-21 22:00:50.668	2026-08-21 22:00:51.406	2026-08-21 22:00:50.668
cmt3hte1e004lv3mo228c90o3	payment.awaiting_approval	{"amount": 314900, "status": "AWAITING_APPROVAL", "orderId": "cmt3hte0x004fv3mo9v1qy5x0", "provider": "bank_transfer", "paymentId": "cmt3hte1b004kv3mobkgwkjtz"}	DONE	0	\N	2026-08-21 22:00:21.074	2026-08-21 22:00:21.8	2026-08-21 22:00:21.074
cmt3hte1h004mv3morlvusnkb	order.placed	{"userId": null, "orderId": "cmt3hte0x004fv3mo9v1qy5x0", "placedAt": "2026-08-21T22:00:21.057Z", "grandTotal": 314900, "orderNumber": "YSN-2026-0013", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:21.078	2026-08-21 22:00:22.395	2026-08-21 22:00:21.078
cmt3hte5j0051v3mop12zuiaj	payment.awaiting_approval	{"amount": 314900, "status": "AWAITING_APPROVAL", "orderId": "cmt3hte57004vv3moqgrx8c4e", "provider": "bank_transfer", "paymentId": "cmt3hte5g0050v3mobftom0w0"}	DONE	0	\N	2026-08-21 22:00:21.223	2026-08-21 22:00:22.398	2026-08-21 22:00:21.223
cmt3hte5n0052v3mojbyhclzu	order.placed	{"userId": null, "orderId": "cmt3hte57004vv3moqgrx8c4e", "placedAt": "2026-08-21T22:00:21.211Z", "grandTotal": 314900, "orderNumber": "YSN-2026-0014", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:21.227	2026-08-21 22:00:22.432	2026-08-21 22:00:21.227
cmt3hte7n005ev3mollggnd0v	order.placed	{"userId": null, "orderId": "cmt3hte770058v3mo7r9i5w97", "placedAt": "2026-08-21T22:00:21.283Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0015", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:21.3	2026-08-21 22:00:22.459	2026-08-21 22:00:21.3
cmt3hte8v005hv3movc4jux3r	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmt3hte770058v3mo7r9i5w97", "toStatus": "CONFIRMED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0015"}	DONE	0	\N	2026-08-21 22:00:21.344	2026-08-21 22:00:22.472	2026-08-21 22:00:21.344
cmt3hte9s005mv3moaw8rjdeh	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmt3hte770058v3mo7r9i5w97", "toStatus": "PROCESSING", "fromStatus": "CONFIRMED", "orderNumber": "YSN-2026-0015"}	DONE	0	\N	2026-08-21 22:00:21.377	2026-08-21 22:00:22.484	2026-08-21 22:00:21.377
cmt3hteas005rv3mom60e9huk	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmt3hte770058v3mo7r9i5w97", "toStatus": "READY_TO_SHIP", "fromStatus": "PROCESSING", "orderNumber": "YSN-2026-0015"}	DONE	0	\N	2026-08-21 22:00:21.413	2026-08-21 22:00:22.495	2026-08-21 22:00:21.413
cmt3htebr005wv3moedgirfx6	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmt3hte770058v3mo7r9i5w97", "toStatus": "SHIPPED", "fromStatus": "READY_TO_SHIP", "orderNumber": "YSN-2026-0015"}	DONE	0	\N	2026-08-21 22:00:21.447	2026-08-21 22:00:22.507	2026-08-21 22:00:21.447
cmt3htecq0061v3mo1t02gm64	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmt3hte770058v3mo7r9i5w97", "toStatus": "DELIVERED", "fromStatus": "SHIPPED", "orderNumber": "YSN-2026-0015"}	DONE	0	\N	2026-08-21 22:00:21.483	2026-08-21 22:00:22.518	2026-08-21 22:00:21.483
cmt3hu1e2001nv3wc9r2sh6b6	stitching.job_stage_changed	{"jobId": "cmt3hu0fg000hv3wc73zigj1g", "orderId": "cmt3hu0dh0009v3wcmcdg8f2v", "toStage": "QC", "fromStage": "STITCHING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-21 22:00:51.339	2026-08-21 22:00:51.415	2026-08-21 22:00:51.339
cmt3hu1f0001sv3wco8nmqa2f	stitching.job_stage_changed	{"jobId": "cmt3hu0fg000hv3wc73zigj1g", "orderId": "cmt3hu0dh0009v3wcmcdg8f2v", "toStage": "READY", "fromStage": "QC", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-21 22:00:51.372	2026-08-21 22:00:51.423	2026-08-21 22:00:51.372
cmt3hu1j0001zv3wcj6eip2oh	stitching.order_created	{"number": "STO-2026-0001", "stitchingOrderId": "cmt3hu1ip001wv3wcr8omboge"}	DONE	0	\N	2026-08-21 22:00:51.517	2026-08-21 22:00:56.139	2026-08-21 22:00:51.517
cmt3hu1k10025v3wc9tirgdqx	stitching.order_created	{"number": "STO-2026-0002", "stitchingOrderId": "cmt3hu1jt0021v3wczgt8k20i"}	DONE	0	\N	2026-08-21 22:00:51.553	2026-08-21 22:00:56.143	2026-08-21 22:00:51.553
cmt3hu75f0049v3wchj5tbgje	order.placed	{"userId": null, "orderId": "cmt3hu74o0043v3wck6x2r47a", "placedAt": "2026-08-21T22:00:58.777Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0005", "customerName": "Backfill Test", "customerEmail": null, "customerPhone": "+923216667777", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:58.803	2026-08-21 22:00:58.829	2026-08-21 22:00:58.803
cmt3hu7b7004nv3wcig71s3mn	order.placed	{"userId": null, "orderId": "cmt3hu7as004hv3wc7p6epc6z", "placedAt": "2026-08-21T22:00:58.996Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0006", "customerName": "Stale Rollup", "customerEmail": null, "customerPhone": "+923217778888", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:59.012	2026-08-21 22:00:59.027	2026-08-21 22:00:59.012
cmt3hupsn0096v3wc5rou6myy	order.placed	{"userId": null, "orderId": "cmt3hups70090v3wcwwsuik6i", "placedAt": "2026-08-21T22:01:22.951Z", "grandTotal": 334900, "orderNumber": "YSN-2026-0005", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:01:22.967	2026-08-21 22:01:24.153	2026-08-21 22:01:22.967
cmt3hupum009iv3wcpa720kwt	order.placed	{"userId": null, "orderId": "cmt3hupu7009cv3wce5tk4bnk", "placedAt": "2026-08-21T22:01:23.024Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0006", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:01:23.039	2026-08-21 22:01:24.175	2026-08-21 22:01:23.039
cmtel5nic00kov32sk4hh9ewd	stitching.job_created	{"jobId": "cmtel5ngh00kmv32sv7sy5psx", "orderId": "cmtel5nav00kav32sqi913koo", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0002", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:19:20.005	2026-08-29 16:19:20.071	2026-08-29 16:19:20.005
cmtel5no300l4v32suh4k9pso	order.placed	{"userId": null, "orderId": "cmtel5nn400kuv32saqsohnkr", "placedAt": "2026-08-29T16:19:20.176Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0003", "customerName": "Sana Iqbal", "customerEmail": null, "customerPhone": "+923445556666", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:07.486	2026-08-29 16:20:07.503	2026-08-29 16:19:20.212
cmt3htegy006mv3mob9eud3hv	order.cancelled	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmt3htef50069v3moyp51ny31", "toStatus": "CANCELLED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0016"}	DONE	0	\N	2026-08-21 22:00:21.634	2026-08-21 22:00:49.858	2026-08-21 22:00:21.634
cmtdd61u3004mv3xwk2qvwg47	order.placed	{"userId": null, "orderId": "cmtdd61ta004cv3xwcsidh894", "placedAt": "2026-08-28T19:47:55.438Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0004", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:55.467	2026-08-28 19:47:56.008	2026-08-28 19:47:55.467
cmtdd61wv0052v3xwwsrkk4ba	order.placed	{"userId": null, "orderId": "cmtdd61vz004sv3xw8ny6cvbj", "placedAt": "2026-08-28T19:47:55.534Z", "grandTotal": 334900, "orderNumber": "YSN-2026-0005", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:55.567	2026-08-28 19:47:56.264	2026-08-28 19:47:55.567
cmtdd61zm005iv3xwnjtmnqlg	order.placed	{"userId": null, "orderId": "cmtdd61yr0058v3xwiueoj6fy", "placedAt": "2026-08-28T19:47:55.635Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0006", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:55.666	2026-08-28 19:47:56.311	2026-08-28 19:47:55.666
cmtdd622j005yv3xw8syhypkx	order.placed	{"userId": null, "orderId": "cmtdd621o005ov3xwym95ds1x", "placedAt": "2026-08-28T19:47:55.740Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0007", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:55.772	2026-08-28 19:47:56.407	2026-08-28 19:47:55.772
cmtdd626j006ev3xwhzbdz9v5	order.placed	{"userId": null, "orderId": "cmtdd625o0064v3xwdiivicu5", "placedAt": "2026-08-28T19:47:55.884Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0008", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:55.915	2026-08-28 19:47:56.456	2026-08-28 19:47:55.915
cmt3htefs006fv3mo3ygn3bks	order.placed	{"userId": null, "orderId": "cmt3htef50069v3moyp51ny31", "placedAt": "2026-08-21T22:00:21.569Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0016", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:50.145	2026-08-21 22:00:50.201	2026-08-21 22:00:21.593
cmtdd5xsz0036v3xw4c4lcsvb	stitching.order_created	{"number": "STO-2026-0002", "stitchingOrderId": "cmtdd5xso0032v3xwzu0yfwpf"}	DONE	0	\N	2026-08-28 19:47:50.244	2026-08-28 19:47:56.467	2026-08-28 19:47:50.244
cmtdd62ev007av3xwymnlrfzw	order.placed	{"userId": null, "orderId": "cmtdd62dh0070v3xwsynnx0b1", "placedAt": "2026-08-28T19:47:56.164Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0010", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:56.215	2026-08-28 19:47:58.088	2026-08-28 19:47:56.215
cmtdd63hu008mv3xwuh1niw2p	order.placed	{"userId": null, "orderId": "cmtdd634z008cv3xwb57fx3c3", "placedAt": "2026-08-28T19:47:57.155Z", "grandTotal": 460000, "orderNumber": "YSN-2026-0011", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:57.619	2026-08-28 19:47:58.131	2026-08-28 19:47:57.619
cmtdd63q7009mv3xw08z8uh22	order.placed	{"userId": null, "orderId": "cmtdd63nj009cv3xw1ooijue4", "placedAt": "2026-08-28T19:47:57.823Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0014", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:57.92	2026-08-28 19:47:58.22	2026-08-28 19:47:57.92
cmt3htejo0070v3mojwvuwwj9	order.placed	{"userId": null, "orderId": "cmt3hteja006uv3mo1xop0fzv", "placedAt": "2026-08-21T22:00:21.718Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0017", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:56.298	2026-08-21 22:00:56.529	2026-08-21 22:00:21.732
cmt3hu53c002lv3wcm1yytrgh	order.placed	{"userId": null, "orderId": "cmt3hu52k002fv3wcd808ahcg", "placedAt": "2026-08-21T22:00:56.109Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0002", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:56.298	2026-08-21 22:00:56.552	2026-08-21 22:00:56.136
cmt3hu56v002zv3wcjqkopxmz	order.placed	{"userId": null, "orderId": "cmt3hu56e002tv3wchu6y3rdm", "placedAt": "2026-08-21T22:00:56.246Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0003", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:00:56.298	2026-08-21 22:00:56.572	2026-08-21 22:00:56.263
cmt3hunb6007mv3wccingongi	user.registered	{"name": "Merge", "email": "merge-1787349679139@example.com", "phone": null, "userId": "cmt3hunb2007lv3wcz54fhur8"}	DONE	0	\N	2026-08-21 22:01:19.746	2026-08-21 22:01:24.178	2026-08-21 22:01:19.746
cmt3hupwl009uv3wcjyqlb7xw	order.placed	{"userId": null, "orderId": "cmt3hupw3009ov3wcntkfy1cn", "placedAt": "2026-08-21T22:01:23.091Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0007", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:01:23.109	2026-08-21 22:01:24.208	2026-08-21 22:01:23.109
cmt3hupyx00a6v3wcqeyzm01y	order.placed	{"userId": null, "orderId": "cmt3hupyk00a0v3wcmxhcadu5", "placedAt": "2026-08-21T22:01:23.180Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0008", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:01:23.194	2026-08-21 22:01:24.228	2026-08-21 22:01:23.194
cmt3huq0v00aiv3wc8my5x2r6	order.placed	{"userId": null, "orderId": "cmt3huq0i00acv3wcaf6q7kvo", "placedAt": "2026-08-21T22:01:23.250Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0009", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:01:23.264	2026-08-21 22:01:24.253	2026-08-21 22:01:23.264
cmt3huq2s00auv3wcafak21lg	order.placed	{"userId": null, "orderId": "cmt3huq2f00aov3wchvki95ad", "placedAt": "2026-08-21T22:01:23.319Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0010", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:01:23.332	2026-08-21 22:01:24.274	2026-08-21 22:01:23.332
cmt3husmf00etv3wcen6vmlnf	stitching.job_created	{"jobId": "cmt3huslw00erv3wcv63fh546", "orderId": "cmt3huqv300bcv3wcabqshsqr", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0002", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-21 22:01:26.631	2026-08-22 00:50:04.512	2026-08-21 22:01:26.631
cmtel4yby001dv32sccmg3exu	order.placed	{"userId": null, "orderId": "cmtel4yb90013v32sy95qcyip", "placedAt": "2026-08-29T16:18:47.349Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0004", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:47.374	2026-08-29 16:18:47.613	2026-08-29 16:18:47.374
cmt3hurzs00e6v3wcmba218mm	order.placed	{"userId": null, "orderId": "cmt3hurzf00e0v3wc2eyr53we", "placedAt": "2026-08-21T22:01:25.803Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0016", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:48.751	2026-08-28 19:47:48.789	2026-08-21 22:01:25.816
cmt3hus2r00env3wc17vp1let	order.placed	{"userId": null, "orderId": "cmt3hus2f00ehv3wcwqm0fqpt", "placedAt": "2026-08-21T22:01:25.911Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0017", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:48.751	2026-08-28 19:47:48.794	2026-08-21 22:01:25.924
cmtel8uti000hv330fstqev0h	order.placed	{"userId": null, "orderId": "cmtel8urv0007v330s5htqz7b", "placedAt": "2026-08-29T16:21:49.387Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0002", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:49.642	2026-08-29 16:21:49.67	2026-08-29 16:21:49.446
cmt3huror00ctv3wcczgwadn8	order.placed	{"userId": null, "orderId": "cmt3huro900cmv3wc2x36a23s", "placedAt": "2026-08-21T22:01:25.401Z", "grandTotal": 314900, "orderNumber": "YSN-2026-0014", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	PROCESSING	0	\N	2026-08-21 22:01:25.419	\N	2026-08-21 22:01:25.419
cmt3hurr500d5v3wcbo91hxcn	order.placed	{"userId": null, "orderId": "cmt3hurqb00czv3wcbk1e7myl", "placedAt": "2026-08-21T22:01:25.475Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0015", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	PROCESSING	0	\N	2026-08-21 22:01:25.505	\N	2026-08-21 22:01:25.505
cmt3hurtb00d8v3wcck05bdyp	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmt3hurqb00czv3wcbk1e7myl", "toStatus": "CONFIRMED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0015"}	PROCESSING	0	\N	2026-08-21 22:01:25.584	\N	2026-08-21 22:01:25.584
cmt3huruc00ddv3wcpkty7rws	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmt3hurqb00czv3wcbk1e7myl", "toStatus": "PROCESSING", "fromStatus": "CONFIRMED", "orderNumber": "YSN-2026-0015"}	PROCESSING	0	\N	2026-08-21 22:01:25.62	\N	2026-08-21 22:01:25.62
cmt3hurv800div3wctkdwdbzd	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmt3hurqb00czv3wcbk1e7myl", "toStatus": "READY_TO_SHIP", "fromStatus": "PROCESSING", "orderNumber": "YSN-2026-0015"}	PROCESSING	0	\N	2026-08-21 22:01:25.652	\N	2026-08-21 22:01:25.652
cmt3hurw400dnv3wcmvwbdz83	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmt3hurqb00czv3wcbk1e7myl", "toStatus": "SHIPPED", "fromStatus": "READY_TO_SHIP", "orderNumber": "YSN-2026-0015"}	PROCESSING	0	\N	2026-08-21 22:01:25.684	\N	2026-08-21 22:01:25.684
cmt3hurx100dsv3wcnq92v74e	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmt3hurqb00czv3wcbk1e7myl", "toStatus": "DELIVERED", "fromStatus": "SHIPPED", "orderNumber": "YSN-2026-0015"}	PROCESSING	0	\N	2026-08-21 22:01:25.717	\N	2026-08-21 22:01:25.717
cmt3hus0l00e9v3wcpjyte8bm	order.cancelled	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmt3hurzf00e0v3wc2eyr53we", "toStatus": "CANCELLED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0016"}	PROCESSING	0	\N	2026-08-21 22:01:25.845	\N	2026-08-21 22:01:25.845
cmtel6nzh000hv3mcek6im04b	order.placed	{"userId": null, "orderId": "cmtel6nxp0007v3mc3vl8870u", "placedAt": "2026-08-29T16:20:07.213Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0002", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:07.486	2026-08-29 16:20:07.523	2026-08-29 16:20:07.278
cmt3huqvw00biv3wc9ltkye3f	order.placed	{"userId": "cmsx5rehl0005v3uwdwy4jud8", "orderId": "cmt3huqv300bcv3wcabqshsqr", "placedAt": "2026-08-21T22:01:24.351Z", "grandTotal": 580000, "orderNumber": "YSN-2026-0011", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": ["cmt3huqv400bev3wc0xbh3f5e"]}	DONE	0	\N	2026-08-21 22:01:24.38	2026-08-21 22:01:26.754	2026-08-21 22:01:24.38
cmt3huqyp00buv3wcqkpc2ewx	order.placed	{"userId": null, "orderId": "cmt3huqy900bov3wcnjnrg1if", "placedAt": "2026-08-21T22:01:24.465Z", "grandTotal": 550000, "orderNumber": "YSN-2026-0012", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": ["cmt3huqya00bqv3wc4wghvhyr"]}	DONE	0	\N	2026-08-21 22:01:24.481	2026-08-21 22:01:26.784	2026-08-21 22:01:24.481
cmt3hurl700ccv3wcm0hm103e	payment.awaiting_approval	{"amount": 314900, "status": "AWAITING_APPROVAL", "orderId": "cmt3hurkq00c6v3wctc6wwpp9", "provider": "bank_transfer", "paymentId": "cmt3hurl400cbv3wc32z19l6d"}	DONE	0	\N	2026-08-21 22:01:25.292	2026-08-21 22:01:26.787	2026-08-21 22:01:25.292
cmt3hurlb00cdv3wcxc8h95es	order.placed	{"userId": null, "orderId": "cmt3hurkq00c6v3wctc6wwpp9", "placedAt": "2026-08-21T22:01:25.274Z", "grandTotal": 314900, "orderNumber": "YSN-2026-0013", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-21 22:01:25.295	2026-08-21 22:01:26.806	2026-08-21 22:01:25.295
cmt3hurmj00cev3wcbl4iugps	payment.succeeded	{"amount": 314900, "status": "PAID", "orderId": "cmt3hurkq00c6v3wctc6wwpp9", "provider": "bank_transfer", "paymentId": "cmt3hurl400cbv3wc32z19l6d"}	DONE	0	\N	2026-08-21 22:01:25.339	2026-08-21 22:01:26.809	2026-08-21 22:01:25.339
cmt3huron00csv3wco0bgln42	payment.awaiting_approval	{"amount": 314900, "status": "AWAITING_APPROVAL", "orderId": "cmt3huro900cmv3wc2x36a23s", "provider": "bank_transfer", "paymentId": "cmt3hurol00crv3wccj1kvcvw"}	DONE	0	\N	2026-08-21 22:01:25.416	2026-08-21 22:01:26.812	2026-08-21 22:01:25.416
cmtdd61og003qv3xwv2ew9nx3	order.placed	{"userId": null, "orderId": "cmtdd61mt003gv3xwbhm832bl", "placedAt": "2026-08-28T19:47:55.204Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0002", "customerName": "Ayesha Khan", "customerEmail": "ayesha@example.com", "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:55.264	2026-08-28 19:47:56.548	2026-08-28 19:47:55.264
cmtdd61rb0046v3xwv1sf6l2j	order.placed	{"userId": null, "orderId": "cmtdd61qh003wv3xwda845szi", "placedAt": "2026-08-28T19:47:55.337Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0003", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:55.368	2026-08-28 19:47:56.583	2026-08-28 19:47:55.368
cmtdd63n3009av3xw5u4eli4h	order.placed	{"userId": null, "orderId": "cmtdd63ky0090v3xwl9mhzqre", "placedAt": "2026-08-28T19:47:57.730Z", "grandTotal": 530000, "orderNumber": "YSN-2026-0013", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:57.807	2026-08-28 19:47:58.286	2026-08-28 19:47:57.807
cmtel5okr00m6v32sa6gnrh2c	stitching.order_created	{"number": "STO-2026-0001", "stitchingOrderId": "cmtel5ok900m3v32ski3d5odr"}	DONE	0	\N	2026-08-29 16:19:21.387	2026-08-29 16:20:07.331	2026-08-29 16:19:21.387
cmtel5olw00mcv32sovt2lr95	stitching.order_created	{"number": "STO-2026-0002", "stitchingOrderId": "cmtel5oln00m8v32six86u4q2"}	DONE	0	\N	2026-08-29 16:19:21.428	2026-08-29 16:20:07.334	2026-08-29 16:19:21.428
cmtel4y6u000hv32s633kfw5d	order.placed	{"userId": null, "orderId": "cmtel4y470007v32s1hb04y2w", "placedAt": "2026-08-29T16:18:47.096Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0002", "customerName": "Ayesha Khan", "customerEmail": "ayesha@example.com", "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:47.19	2026-08-29 16:18:47.644	2026-08-29 16:18:47.19
cmtel4y9p000xv32spbt44ydg	order.placed	{"userId": null, "orderId": "cmtel4y8y000nv32smcbrj9bn", "placedAt": "2026-08-29T16:18:47.266Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0003", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:47.294	2026-08-29 16:18:47.674	2026-08-29 16:18:47.294
cmtel4yec001tv32sgj1zxwzh	order.placed	{"userId": null, "orderId": "cmtel4ydj001jv32se1yzvq9n", "placedAt": "2026-08-29T16:18:47.431Z", "grandTotal": 334900, "orderNumber": "YSN-2026-0005", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:47.46	2026-08-29 16:18:47.704	2026-08-29 16:18:47.46
cmtel4ygl0029v32synb5uvuv	order.placed	{"userId": null, "orderId": "cmtel4yfv001zv32s9mpawn7i", "placedAt": "2026-08-29T16:18:47.515Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0006", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:47.542	2026-08-29 16:18:47.729	2026-08-29 16:18:47.542
cmtel4yol002pv32stz7ohm41	order.placed	{"userId": null, "orderId": "cmtel4yj4002fv32sib7y11d8", "placedAt": "2026-08-29T16:18:47.632Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0007", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:47.829	2026-08-29 16:18:50.048	2026-08-29 16:18:47.829
cmtel4yrr0035v32szjmcl3pn	order.placed	{"userId": null, "orderId": "cmtel4yqz002vv32s14f2im04", "placedAt": "2026-08-29T16:18:47.915Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0008", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:47.943	2026-08-29 16:18:50.074	2026-08-29 16:18:47.943
cmtel4yu6003lv32sg74glxmc	order.placed	{"userId": null, "orderId": "cmtel4yth003bv32srci7ix5m", "placedAt": "2026-08-29T16:18:48.005Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0009", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:48.03	2026-08-29 16:18:50.097	2026-08-29 16:18:48.03
cmtel4zd6005dv32swjss5v6w	order.placed	{"userId": null, "orderId": "cmtel4z6l0053v32s2c3a3j4j", "placedAt": "2026-08-29T16:18:48.477Z", "grandTotal": 460000, "orderNumber": "YSN-2026-0011", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:48.714	2026-08-29 16:18:50.12	2026-08-29 16:18:48.714
cmtel4zk80071v32scdqsj7o4	order.placed	{"userId": null, "orderId": "cmtel4zj0006rv32s89tpfr39", "placedAt": "2026-08-29T16:18:48.924Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0016", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:48.969	2026-08-29 16:18:50.146	2026-08-29 16:18:48.969
cmtel4zo8007lv32s5rz68pkr	order.placed	{"userId": null, "orderId": "cmtel4zng007bv32s3meug8ge", "placedAt": "2026-08-29T16:18:49.084Z", "grandTotal": 145000, "orderNumber": "YSN-2026-0017", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:49.112	2026-08-29 16:18:50.166	2026-08-29 16:18:49.112
cmtel4zx20090v32sabavn1gq	order.placed	{"userId": null, "orderId": "cmtel4zvj008lv32ssdjje5ur", "placedAt": "2026-08-29T16:18:49.375Z", "grandTotal": 740000, "orderNumber": "YSN-2026-0019", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:49.431	2026-08-29 16:18:50.191	2026-08-29 16:18:49.431
cmtel51r700czv32snnc341tz	order.cancelled	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel51p000chv32sz6t1dh7o", "toStatus": "CANCELLED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0025"}	DONE	0	\N	2026-08-29 16:18:51.812	2026-08-29 16:18:58.235	2026-08-29 16:18:51.812
cmtel51pw00csv32sjr58duzf	order.placed	{"userId": null, "orderId": "cmtel51p000chv32sz6t1dh7o", "placedAt": "2026-08-29T16:18:51.733Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0025", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:19:13.071	2026-08-29 16:19:13.086	2026-08-29 16:18:51.764
cmtel5hzw00hcv32sycwtu9xk	order.placed	{"userId": null, "orderId": "cmtel5hyl00h2v32sg1wx9o8k", "placedAt": "2026-08-29T16:19:12.813Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0002", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:19:13.071	2026-08-29 16:19:13.105	2026-08-29 16:19:12.86
cmtel5i4f00huv32sx98g8jjm	order.placed	{"userId": null, "orderId": "cmtel5i3q00hkv32smss6u0zr", "placedAt": "2026-08-29T16:19:12.998Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0003", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:19:13.071	2026-08-29 16:19:13.125	2026-08-29 16:19:13.024
cmtel5i9y00iav32subu1teue	order.placed	{"userId": null, "orderId": "cmtel5i9400i0v32slooode22", "placedAt": "2026-08-29T16:19:13.193Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0004", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:19:13.222	2026-08-29 16:19:13.249	2026-08-29 16:19:13.222
cmtel5ibw00ihv32s3wguibll	order.cancelled	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel5i9400i0v32slooode22", "toStatus": "CANCELLED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0004"}	DONE	0	\N	2026-08-29 16:19:13.292	2026-08-29 16:19:13.322	2026-08-29 16:19:13.292
cmtel5nue00lev32s98rs3rub	stitching.job_stage_changed	{"jobId": "cmtel5ngh00kmv32sv7sy5psx", "orderId": "cmtel5nav00kav32sqi913koo", "toStage": "STITCHING", "fromStage": "CUTTING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:19:20.438	2026-08-29 16:19:21.219	2026-08-29 16:19:20.438
cmtdd629x006uv3xw1d6qja3x	order.placed	{"userId": null, "orderId": "cmtdd628u006kv3xwdjbpzc7n", "placedAt": "2026-08-28T19:47:55.998Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0009", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:56.038	2026-08-28 19:47:58.037	2026-08-28 19:47:56.038
cmtdd63kk008yv3xwn4l2zp3m	order.placed	{"userId": null, "orderId": "cmtdd63if008ov3xwn75hsvcp", "placedAt": "2026-08-28T19:47:57.639Z", "grandTotal": 305000, "orderNumber": "YSN-2026-0012", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:57.716	2026-08-28 19:47:58.173	2026-08-28 19:47:57.716
cmtel6o40000zv3mcw1k0ssd5	order.placed	{"userId": null, "orderId": "cmtel6o33000pv3mc8ewdwo4n", "placedAt": "2026-08-29T16:20:07.407Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0003", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:07.486	2026-08-29 16:20:07.543	2026-08-29 16:20:07.44
cmtel4yw80041v32syx42178c	order.placed	{"userId": null, "orderId": "cmtel4yvl003rv32s5gqur8qj", "placedAt": "2026-08-29T16:18:48.081Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0010", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:48.105	2026-08-29 16:18:50.213	2026-08-29 16:18:48.105
cmtel4zdz005pv32syo7pfz7x	order.placed	{"userId": null, "orderId": "cmtel4zde005fv32sk8uwgyts", "placedAt": "2026-08-29T16:18:48.722Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0012", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:48.743	2026-08-29 16:18:50.243	2026-08-29 16:18:48.743
cmtel6oej001mv3mc078przi0	order.cancelled	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel6oar0015v3mccn2961jl", "toStatus": "CANCELLED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0004"}	DONE	0	\N	2026-08-29 16:20:07.819	2026-08-29 16:20:07.849	2026-08-29 16:20:07.819
cmtel932600g3v3302m03ve5q	order.cancelled	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel930900fmv330anlzuy0y", "toStatus": "CANCELLED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0025"}	DONE	0	\N	2026-08-29 16:22:00.127	2026-08-29 16:22:00.74	2026-08-29 16:22:00.127
cmtdd63u3009yv3xwud6kyhs7	order.placed	{"userId": null, "orderId": "cmtdd63r3009ov3xwfz3fr1ft", "placedAt": "2026-08-28T19:47:57.951Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0015", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:58.059	2026-08-28 19:48:00.309	2026-08-28 19:47:58.059
cmtdd63xt00aav3xw4u28bplo	order.placed	{"userId": null, "orderId": "cmtdd63ur00a0v3xw5zk977hh", "placedAt": "2026-08-28T19:47:58.083Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0016", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:58.194	2026-08-28 19:48:00.363	2026-08-28 19:47:58.194
cmtdd647700auv3xwij6xm1p9	order.placed	{"userId": null, "orderId": "cmtdd645g00akv3xwknl26n7c", "placedAt": "2026-08-28T19:47:58.467Z", "grandTotal": 145000, "orderNumber": "YSN-2026-0017", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:58.531	2026-08-28 19:48:00.43	2026-08-28 19:47:58.531
cmtdd64ne00bsv3xw0yguwttt	order.placed	{"userId": null, "orderId": "cmtdd64it00bdv3xwueu10rnd", "placedAt": "2026-08-28T19:47:58.949Z", "grandTotal": 740000, "orderNumber": "YSN-2026-0018", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:59.114	2026-08-28 19:48:00.496	2026-08-28 19:47:59.114
cmtdd64qs00c9v3xwjxxfr4n4	order.placed	{"userId": null, "orderId": "cmtdd64o400buv3xwj72pw1pw", "placedAt": "2026-08-28T19:47:59.139Z", "grandTotal": 740000, "orderNumber": "YSN-2026-0019", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:47:59.236	2026-08-28 19:48:00.544	2026-08-28 19:47:59.236
cmtel518200ajv32sujxkt8wp	order.placed	{"userId": null, "orderId": "cmtel517300a8v32sz3lkr6t9", "placedAt": "2026-08-29T16:18:51.087Z", "grandTotal": 314900, "orderNumber": "YSN-2026-0022", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:51.122	2026-08-29 16:18:51.693	2026-08-29 16:18:51.122
cmtdd65vq00cpv3xw0ufuhq3t	order.placed	{"userId": "cmsx5rehl0005v3uwdwy4jud8", "orderId": "cmtdd65ub00cfv3xwp28m3uhy", "placedAt": "2026-08-28T19:48:00.658Z", "grandTotal": 580000, "orderNumber": "YSN-2026-0020", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": ["cmtdd65uc00chv3xwerh727dz"]}	DONE	0	\N	2026-08-28 19:48:00.71	2026-08-28 19:48:02.13	2026-08-28 19:48:00.71
cmtdd661v00d5v3xwrfevt6sn	order.placed	{"userId": null, "orderId": "cmtdd660b00cvv3xw5rdsfhee", "placedAt": "2026-08-28T19:48:00.874Z", "grandTotal": 550000, "orderNumber": "YSN-2026-0021", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": ["cmtdd660c00cxv3xwo1rg75fz"]}	DONE	0	\N	2026-08-28 19:48:00.931	2026-08-28 19:48:02.253	2026-08-28 19:48:00.931
cmtdd66yt00dfv3xw372awula	stitching.job_created	{"jobId": "cmtdd66xx00dbv3xwghoh4p7f", "orderId": "cmtdd65ub00cfv3xwp28m3uhy", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0002", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-28 19:48:02.118	2026-08-28 19:48:03.996	2026-08-28 19:48:02.118
cmtdd672000djv3xwvfgmwpp7	stitching.job_created	{"jobId": "cmtdd671900dhv3xwzc4f324f", "orderId": "cmtdd660b00cvv3xw5rdsfhee", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0003", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-28 19:48:02.232	2026-08-28 19:48:04.001	2026-08-28 19:48:02.232
cmtdd679o00dzv3xwyv89kt7e	payment.awaiting_approval	{"amount": 314900, "status": "AWAITING_APPROVAL", "orderId": "cmtdd678000dpv3xw5enxvv6y", "provider": "bank_transfer", "paymentId": "cmtdd679j00dyv3xw4mn20hyt"}	DONE	0	\N	2026-08-28 19:48:02.508	2026-08-28 19:48:04.006	2026-08-28 19:48:02.508
cmtdd679w00e0v3xw9rdrm9h0	order.placed	{"userId": null, "orderId": "cmtdd678000dpv3xw5enxvv6y", "placedAt": "2026-08-28T19:48:02.448Z", "grandTotal": 314900, "orderNumber": "YSN-2026-0022", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:48:02.516	2026-08-28 19:48:04.06	2026-08-28 19:48:02.516
cmtdd67dm00e1v3xw4l3dp326	payment.succeeded	{"amount": 314900, "status": "PAID", "orderId": "cmtdd678000dpv3xw5enxvv6y", "provider": "bank_transfer", "paymentId": "cmtdd679j00dyv3xw4mn20hyt"}	DONE	0	\N	2026-08-28 19:48:02.65	2026-08-28 19:48:04.064	2026-08-28 19:48:02.65
cmtdd67k100ejv3xw4qvthjye	payment.awaiting_approval	{"amount": 314900, "status": "AWAITING_APPROVAL", "orderId": "cmtdd67id00e9v3xwmohp3uth", "provider": "bank_transfer", "paymentId": "cmtdd67jv00eiv3xw2mf7e37a"}	DONE	0	\N	2026-08-28 19:48:02.881	2026-08-28 19:48:04.071	2026-08-28 19:48:02.881
cmtel4zfi0061v32s043dsai4	order.placed	{"userId": null, "orderId": "cmtel4ze7005rv32sk470qlhk", "placedAt": "2026-08-29T16:18:48.751Z", "grandTotal": 305000, "orderNumber": "YSN-2026-0013", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:48.798	2026-08-29 16:18:50.265	2026-08-29 16:18:48.798
cmtel5jz300jyv32scevy1vnf	order.placed	{"userId": null, "orderId": "cmtel5jya00jov32sins2nd4q", "placedAt": "2026-08-29T16:19:15.394Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0006", "customerName": "Stale Rollup", "customerEmail": null, "customerPhone": "+923217778888", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:07.486	2026-08-29 16:20:07.548	2026-08-29 16:19:15.424
cmtel8uxr000zv3302iaz9owt	order.placed	{"userId": null, "orderId": "cmtel8ux0000pv3300rqsn0ny", "placedAt": "2026-08-29T16:21:49.573Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0003", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:49.642	2026-08-29 16:21:49.69	2026-08-29 16:21:49.599
cmtel6oby001fv3mc4el5l857	order.placed	{"userId": null, "orderId": "cmtel6oar0015v3mccn2961jl", "placedAt": "2026-08-29T16:20:07.683Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0004", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:07.726	2026-08-29 16:20:07.76	2026-08-29 16:20:07.726
cmtdd67v800f3v3xwryuew3pj	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtdd67ny00eqv3xw646u1p8x", "toStatus": "CONFIRMED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-28 19:48:03.284	2026-08-28 19:48:04.087	2026-08-28 19:48:03.284
cmtdd67y000f8v3xw9tm552fb	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtdd67ny00eqv3xw646u1p8x", "toStatus": "PROCESSING", "fromStatus": "CONFIRMED", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-28 19:48:03.384	2026-08-28 19:48:04.098	2026-08-28 19:48:03.384
cmtdd680f00fdv3xwrwv75p01	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtdd67ny00eqv3xw646u1p8x", "toStatus": "READY_TO_SHIP", "fromStatus": "PROCESSING", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-28 19:48:03.472	2026-08-28 19:48:04.104	2026-08-28 19:48:03.472
cmtdd68ek00gcv3xwqugyl5u9	order.cancelled	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtdd68aw00fvv3xwxvgkw9pp", "toStatus": "CANCELLED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0025"}	DONE	0	\N	2026-08-28 19:48:03.981	2026-08-28 19:48:19.958	2026-08-28 19:48:03.981
cmtel8v4k001fv330r9ldwce5	order.placed	{"userId": null, "orderId": "cmtel8v3q0015v330mn0ea5vm", "placedAt": "2026-08-29T16:21:49.814Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0004", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:49.844	2026-08-29 16:21:49.865	2026-08-29 16:21:49.844
cmtel50mk009wv32st2fmz6g5	order.placed	{"userId": null, "orderId": "cmtel50lo009mv32ssj7xhm8m", "placedAt": "2026-08-29T16:18:50.316Z", "grandTotal": 550000, "orderNumber": "YSN-2026-0021", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": ["cmtel50lo009ov32sftlrgu2e"]}	DONE	0	\N	2026-08-29 16:18:50.348	2026-08-29 16:18:51.751	2026-08-29 16:18:50.348
cmtel519r00akv32s05k84w5l	payment.succeeded	{"amount": 314900, "status": "PAID", "orderId": "cmtel517300a8v32sz3lkr6t9", "provider": "bank_transfer", "paymentId": "cmtel517v00ahv32sb9rrssva"}	DONE	0	\N	2026-08-29 16:18:51.183	2026-08-29 16:18:51.754	2026-08-29 16:18:51.183
cmtel51ca00b2v32sd5unuh61	payment.awaiting_approval	{"amount": 314900, "status": "AWAITING_APPROVAL", "orderId": "cmtel51bk00asv32stpoycmw0", "provider": "bank_transfer", "paymentId": "cmtel51c700b1v32se57h33f3"}	DONE	0	\N	2026-08-29 16:18:51.274	2026-08-29 16:18:51.758	2026-08-29 16:18:51.274
cmtel51cd00b3v32szxdsx367	order.placed	{"userId": null, "orderId": "cmtel51bk00asv32stpoycmw0", "placedAt": "2026-08-29T16:18:51.249Z", "grandTotal": 314900, "orderNumber": "YSN-2026-0023", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:51.278	2026-08-29 16:18:51.78	2026-08-29 16:18:51.278
cmtel51ju00bwv32s1lq9g55h	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel51e000b9v32shrrsn8ub", "toStatus": "READY_TO_SHIP", "fromStatus": "PROCESSING", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:18:51.546	2026-08-29 16:18:51.813	2026-08-29 16:18:51.546
cmtel51ik00brv32s4vrrkezb	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel51e000b9v32shrrsn8ub", "toStatus": "PROCESSING", "fromStatus": "CONFIRMED", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:18:51.501	2026-08-29 16:18:51.823	2026-08-29 16:18:51.501
cmtel51kv00c1v32sue0bu2b0	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel51e000b9v32shrrsn8ub", "toStatus": "SHIPPED", "fromStatus": "READY_TO_SHIP", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:18:51.583	2026-08-29 16:18:51.841	2026-08-29 16:18:51.583
cmtel51m200c6v32szz5t3zsh	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel51e000b9v32shrrsn8ub", "toStatus": "DELIVERED", "fromStatus": "SHIPPED", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:18:51.627	2026-08-29 16:18:51.851	2026-08-29 16:18:51.627
cmtel51ey00bjv32sjajnvfv1	order.placed	{"userId": null, "orderId": "cmtel51e000b9v32shrrsn8ub", "placedAt": "2026-08-29T16:18:51.336Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0024", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:19:13.071	2026-08-29 16:19:13.129	2026-08-29 16:18:51.37
cmtel51ut00dlv32s7hxg49xi	order.placed	{"userId": null, "orderId": "cmtel51tw00dbv32s9g02cpe4", "placedAt": "2026-08-29T16:18:51.907Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0026", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:19:13.071	2026-08-29 16:19:13.134	2026-08-29 16:18:51.941
cmtel5jsp00jgv32sudp0z8ot	order.placed	{"userId": null, "orderId": "cmtel5jrh00j6v32sl0i6ldy9", "placedAt": "2026-08-29T16:19:15.149Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0005", "customerName": "Backfill Test", "customerEmail": null, "customerPhone": "+923216667777", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:19:20.059	2026-08-29 16:19:20.076	2026-08-29 16:19:15.193
cmtel5nx200lov32s7dklfavk	stitching.job_stage_changed	{"jobId": "cmtel5ngh00kmv32sv7sy5psx", "orderId": "cmtel5nav00kav32sqi913koo", "toStage": "STITCHING", "fromStage": "QC", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:19:20.535	2026-08-29 16:19:21.228	2026-08-29 16:19:20.535
cmtel5odk00luv32s14cstbbe	stitching.job_stage_changed	{"jobId": "cmtel5ngh00kmv32sv7sy5psx", "orderId": "cmtel5nav00kav32sqi913koo", "toStage": "QC", "fromStage": "STITCHING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:19:21.128	2026-08-29 16:19:21.237	2026-08-29 16:19:21.128
cmtel5nfg00kkv32s629uakhr	order.placed	{"userId": "cmsx5rehl0005v3uwdwy4jud8", "orderId": "cmtel5nav00kav32sqi913koo", "placedAt": "2026-08-29T16:19:19.735Z", "grandTotal": 580000, "orderNumber": "YSN-2026-0002", "customerName": "Sana Iqbal", "customerEmail": null, "customerPhone": "+923445556666", "stitchingItemIds": ["cmtel5nav00kcv32sltjxielh"]}	DONE	0	\N	2026-08-29 16:20:07.486	2026-08-29 16:20:07.588	2026-08-29 16:19:19.901
cmtel4zh2006dv32s39lbwg1q	order.placed	{"userId": null, "orderId": "cmtel4zft0063v32svn525kki", "placedAt": "2026-08-29T16:18:48.809Z", "grandTotal": 530000, "orderNumber": "YSN-2026-0014", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:18:48.854	2026-08-29 16:18:50.29	2026-08-29 16:18:48.854
cmtel6pyd002lv3mc1hu5lza5	order.placed	{"userId": null, "orderId": "cmtel6px2002bv3mczfm1bfhd", "placedAt": "2026-08-29T16:20:09.782Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0005", "customerName": "Backfill Test", "customerEmail": null, "customerPhone": "+923216667777", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:09.829	2026-08-29 16:20:09.861	2026-08-29 16:20:09.829
cmtdd67ka00ekv3xwrd2ybqpq	order.placed	{"userId": null, "orderId": "cmtdd67id00e9v3xwmohp3uth", "placedAt": "2026-08-28T19:48:02.821Z", "grandTotal": 314900, "orderNumber": "YSN-2026-0023", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:48:02.89	2026-08-28 19:48:04.147	2026-08-28 19:48:02.89
cmtdd682m00fiv3xwncqpe4zk	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtdd67ny00eqv3xw646u1p8x", "toStatus": "SHIPPED", "fromStatus": "READY_TO_SHIP", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-28 19:48:03.551	2026-08-28 19:48:04.209	2026-08-28 19:48:03.551
cmtdd685j00fnv3xw1ap5uhrl	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtdd67ny00eqv3xw646u1p8x", "toStatus": "DELIVERED", "fromStatus": "SHIPPED", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-28 19:48:03.656	2026-08-28 19:48:04.249	2026-08-28 19:48:03.656
cmtel50it009gv32szf7oydz7	order.placed	{"userId": "cmsx5rehl0005v3uwdwy4jud8", "orderId": "cmtel50hx0096v32ssu12tzuu", "placedAt": "2026-08-29T16:18:50.181Z", "grandTotal": 580000, "orderNumber": "YSN-2026-0020", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": ["cmtel50hx0098v32ssh5tagad"]}	DONE	0	\N	2026-08-29 16:18:50.213	2026-08-29 16:18:51.898	2026-08-29 16:18:50.213
cmtel51h600bmv32ssb3jbwda	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel51e000b9v32shrrsn8ub", "toStatus": "CONFIRMED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:18:51.45	2026-08-29 16:18:51.914	2026-08-29 16:18:51.45
cmtel51pf00clv32sg1q5cyin	stitching.job_created	{"jobId": "cmtel51ot00cev32sy1f413wq", "orderId": "cmtel50lo009mv32ssj7xhm8m", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0002", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:18:51.748	2026-08-29 16:18:58.249	2026-08-29 16:18:51.748
cmtel51tj00d9v32s337kuosf	stitching.job_created	{"jobId": "cmtel51t600d7v32sdqk4ok37", "orderId": "cmtel50hx0096v32ssu12tzuu", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0003", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:18:51.895	2026-08-29 16:18:58.252	2026-08-29 16:18:51.895
cmtel57su00ffv32snplmaxxk	user.registered	{"name": "Merge", "email": "merge-1788020339146@example.com", "phone": null, "userId": "cmtel57sp00fev32sob20fbes"}	DONE	0	\N	2026-08-29 16:18:59.646	2026-08-29 16:19:08.116	2026-08-29 16:18:59.646
cmtdd67qj00f0v3xwdp982a5b	order.placed	{"userId": null, "orderId": "cmtdd67ny00eqv3xw646u1p8x", "placedAt": "2026-08-28T19:48:03.021Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0024", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:48:23.258	2026-08-28 19:48:23.458	2026-08-28 19:48:03.116
cmtdd68c500g5v3xwry6tmk4f	order.placed	{"userId": null, "orderId": "cmtdd68aw00fvv3xwxvgkw9pp", "placedAt": "2026-08-28T19:48:03.848Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0025", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:48:23.258	2026-08-28 19:48:23.575	2026-08-28 19:48:03.893
cmtdd68k400guv3xw448z3b5b	order.placed	{"userId": null, "orderId": "cmtdd68ie00gkv3xwpev9i8kp", "placedAt": "2026-08-28T19:48:04.118Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0026", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:48:23.258	2026-08-28 19:48:23.696	2026-08-28 19:48:04.18
cmtdd6lbk00hev3xwlp30yfkk	order.placed	{"userId": null, "orderId": "cmtdd6l7q00h4v3xwkihsi3c7", "placedAt": "2026-08-28T19:48:20.582Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0002", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:48:23.258	2026-08-28 19:48:24.106	2026-08-28 19:48:20.721
cmtdd6mmn00hwv3xw0dss4ogx	order.placed	{"userId": null, "orderId": "cmtdd6mew00hmv3xwq12rsxrr", "placedAt": "2026-08-28T19:48:22.136Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0003", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:48:23.258	2026-08-28 19:48:24.527	2026-08-28 19:48:22.416
cmtel5nt600l9v32sdexxyf2b	stitching.job_stage_changed	{"jobId": "cmtel5ngh00kmv32sv7sy5psx", "orderId": "cmtel5nav00kav32sqi913koo", "toStage": "CUTTING", "fromStage": "RECEIVED", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:19:20.394	2026-08-29 16:19:21.244	2026-08-29 16:19:20.394
cmtdd6oxg00icv3xwa386mydl	order.placed	{"userId": null, "orderId": "cmtdd6osp00i2v3xw9bilpyxg", "placedAt": "2026-08-28T19:48:25.225Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0004", "customerName": "Fatima Ali", "customerEmail": null, "customerPhone": "+923331234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:48:25.396	2026-08-28 19:48:25.822	2026-08-28 19:48:25.396
cmtdd6pm100ijv3xw5u9vs8i4	order.cancelled	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtdd6osp00i2v3xw9bilpyxg", "toStatus": "CANCELLED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0004"}	DONE	0	\N	2026-08-28 19:48:26.281	2026-08-28 19:48:26.685	2026-08-28 19:48:26.281
cmtdd6ur300jiv3xwgllvr61p	order.placed	{"userId": null, "orderId": "cmtdd6uoe00j8v3xwv4vgt56v", "placedAt": "2026-08-28T19:48:32.845Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0005", "customerName": "Backfill Test", "customerEmail": null, "customerPhone": "+923216667777", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:48:32.944	2026-08-28 19:48:33.027	2026-08-28 19:48:32.944
cmtdd6v2k00k0v3xwbbghd7k0	order.placed	{"userId": null, "orderId": "cmtdd6v1b00jqv3xws6up9vpi", "placedAt": "2026-08-28T19:48:33.310Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0006", "customerName": "Stale Rollup", "customerEmail": null, "customerPhone": "+923217778888", "stitchingItemIds": []}	DONE	0	\N	2026-08-28 19:48:33.357	2026-08-28 19:48:33.396	2026-08-28 19:48:33.357
cmtel8v6x001mv33071xbxrko	order.cancelled	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel8v3q0015v330mn0ea5vm", "toStatus": "CANCELLED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0004"}	DONE	0	\N	2026-08-29 16:21:49.929	2026-08-29 16:21:49.958	2026-08-29 16:21:49.929
cmtel5oev00lzv32stgjicfdv	stitching.job_stage_changed	{"jobId": "cmtel5ngh00kmv32sv7sy5psx", "orderId": "cmtel5nav00kav32sqi913koo", "toStage": "READY", "fromStage": "QC", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:19:21.176	2026-08-29 16:19:21.253	2026-08-29 16:19:21.176
cmtel5nvf00ljv32su9eo13eb	stitching.job_stage_changed	{"jobId": "cmtel5ngh00kmv32sv7sy5psx", "orderId": "cmtel5nav00kav32sqi913koo", "toStage": "QC", "fromStage": "STITCHING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:19:20.475	2026-08-29 16:19:21.265	2026-08-29 16:19:20.475
cmtel6q530033v3mchu209t3s	order.placed	{"userId": null, "orderId": "cmtel6q47002tv3mcuhkuhp6a", "placedAt": "2026-08-29T16:20:10.039Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0006", "customerName": "Stale Rollup", "customerEmail": null, "customerPhone": "+923217778888", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:10.071	2026-08-29 16:20:10.174	2026-08-29 16:20:10.071
cmtel8zru004hv3301sbzodto	order.placed	{"userId": null, "orderId": "cmtel8zr20047v330qyfvv3yp", "placedAt": "2026-08-29T16:21:55.838Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0004", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:55.866	2026-08-29 16:21:56.681	2026-08-29 16:21:55.866
cmtel8zud004xv330nuh66mzf	order.placed	{"userId": null, "orderId": "cmtel8ztj004nv330czirmzyw", "placedAt": "2026-08-29T16:21:55.927Z", "grandTotal": 334900, "orderNumber": "YSN-2026-0005", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:55.958	2026-08-29 16:21:56.712	2026-08-29 16:21:55.958
cmtel8zwv005dv3304xujg7bv	order.placed	{"userId": null, "orderId": "cmtel8zw40053v330vfbwmjuj", "placedAt": "2026-08-29T16:21:56.020Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0006", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:56.048	2026-08-29 16:21:56.736	2026-08-29 16:21:56.048
cmtel8zz6005tv330h2g0sf1s	order.placed	{"userId": null, "orderId": "cmtel8zyf005jv330jl2xrpoa", "placedAt": "2026-08-29T16:21:56.104Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0007", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:56.13	2026-08-29 16:21:56.777	2026-08-29 16:21:56.13
cmtel901k0069v330uz5j3nwi	order.placed	{"userId": null, "orderId": "cmtel900y005zv330k20dvb7r", "placedAt": "2026-08-29T16:21:56.195Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0008", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:56.216	2026-08-29 16:21:56.806	2026-08-29 16:21:56.216
cmtel903z006pv330sqv3q9f1	order.placed	{"userId": null, "orderId": "cmtel903c006fv330zfsmztdg", "placedAt": "2026-08-29T16:21:56.280Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0009", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:56.303	2026-08-29 16:21:56.829	2026-08-29 16:21:56.303
cmtel6tec003nv3mcdfgi082c	order.placed	{"userId": null, "orderId": "cmtel6tcx003dv3mcl5xnf6pa", "placedAt": "2026-08-29T16:20:14.241Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0002", "customerName": "Ayesha Khan", "customerEmail": "ayesha@example.com", "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:14.292	2026-08-29 16:20:15.773	2026-08-29 16:20:14.292
cmtel6tgx0043v3mcj5n4sqlw	order.placed	{"userId": null, "orderId": "cmtel6tg4003tv3mcm6p69bwi", "placedAt": "2026-08-29T16:20:14.356Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0003", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:14.385	2026-08-29 16:20:15.821	2026-08-29 16:20:14.385
cmtel6tti006bv3mcxrmr91j5	order.placed	{"userId": null, "orderId": "cmtel6tsr0061v3mcsl3g3yjz", "placedAt": "2026-08-29T16:20:14.811Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0008", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:14.838	2026-08-29 16:20:15.977	2026-08-29 16:20:14.838
cmtel6tvw006rv3mc2an2r822	order.placed	{"userId": null, "orderId": "cmtel6tv8006hv3mciwp3ilzx", "placedAt": "2026-08-29T16:20:14.900Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0009", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:14.924	2026-08-29 16:20:16.003	2026-08-29 16:20:14.924
cmtel6ty80077v3mcgt5pjr9t	order.placed	{"userId": null, "orderId": "cmtel6txi006xv3mcs0orf5ub", "placedAt": "2026-08-29T16:20:14.982Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0010", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:15.009	2026-08-29 16:20:16.031	2026-08-29 16:20:15.009
cmtel90va008tv330r2aliiw1	order.placed	{"userId": null, "orderId": "cmtel90u1008jv3301ub34bwp", "placedAt": "2026-08-29T16:21:57.241Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0012", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:57.286	2026-08-29 16:21:58.684	2026-08-29 16:21:57.286
cmtel6ugt008jv3mcjeum0y4e	order.placed	{"userId": null, "orderId": "cmtel6u8w0089v3mcfzdterba", "placedAt": "2026-08-29T16:20:15.392Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0011", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:15.678	2026-08-29 16:20:17.924	2026-08-29 16:20:15.678
cmtel6ujv008vv3mcj34f3m3t	order.placed	{"userId": null, "orderId": "cmtel6uhn008lv3mc5nrfbghp", "placedAt": "2026-08-29T16:20:15.707Z", "grandTotal": 305000, "orderNumber": "YSN-2026-0012", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:15.788	2026-08-29 16:20:17.951	2026-08-29 16:20:15.788
cmtel6tjd004jv3mcn97r91yn	order.placed	{"userId": null, "orderId": "cmtel6til0049v3mc96gdxywo", "placedAt": "2026-08-29T16:20:14.445Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0004", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:14.474	2026-08-29 16:20:15.854	2026-08-29 16:20:14.474
cmtel6umg0097v3mcqpu4jmlb	order.placed	{"userId": null, "orderId": "cmtel6ukd008xv3mc5s5wz6pc", "placedAt": "2026-08-29T16:20:15.805Z", "grandTotal": 530000, "orderNumber": "YSN-2026-0013", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:15.88	2026-08-29 16:20:17.98	2026-08-29 16:20:15.88
cmtel8wq0002lv33007o5rfz8	order.placed	{"userId": null, "orderId": "cmtel8wot002bv330pnn75hac", "placedAt": "2026-08-29T16:21:51.869Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0005", "customerName": "Backfill Test", "customerEmail": null, "customerPhone": "+923216667777", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:51.913	2026-08-29 16:21:51.939	2026-08-29 16:21:51.913
cmtel8wwm0033v330titwrzn8	order.placed	{"userId": null, "orderId": "cmtel8wvv002tv330dh68m1si", "placedAt": "2026-08-29T16:21:52.123Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0006", "customerName": "Stale Rollup", "customerEmail": null, "customerPhone": "+923217778888", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:52.151	2026-08-29 16:21:52.171	2026-08-29 16:21:52.151
cmtel910d009tv330km8lnpuw	order.placed	{"userId": null, "orderId": "cmtel90z3009jv330fxn0i2c6", "placedAt": "2026-08-29T16:21:57.423Z", "grandTotal": 530000, "orderNumber": "YSN-2026-0015", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:57.469	2026-08-29 16:21:58.713	2026-08-29 16:21:57.469
cmtel91dr00bnv3300w4lkkbi	order.placed	{"userId": null, "orderId": "cmtel91cj00b8v3308tl2ih9l", "placedAt": "2026-08-29T16:21:57.907Z", "grandTotal": 740000, "orderNumber": "YSN-2026-0018", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:57.952	2026-08-29 16:21:58.738	2026-08-29 16:21:57.952
cmtel90wy0095v330586pjwi3	order.placed	{"userId": null, "orderId": "cmtel90vk008vv3302pf8trji", "placedAt": "2026-08-29T16:21:57.296Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0013", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:57.346	2026-08-29 16:21:58.764	2026-08-29 16:21:57.346
cmtel911y00a5v330gscplig6	order.placed	{"userId": null, "orderId": "cmtel910n009vv3304ipj7lhx", "placedAt": "2026-08-29T16:21:57.479Z", "grandTotal": 305000, "orderNumber": "YSN-2026-0016", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:57.526	2026-08-29 16:21:59.089	2026-08-29 16:21:57.526
cmtel916600apv330pkn2je3d	order.placed	{"userId": null, "orderId": "cmtel915800afv330dmykrab7", "placedAt": "2026-08-29T16:21:57.644Z", "grandTotal": 175000, "orderNumber": "YSN-2026-0017", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:57.678	2026-08-29 16:21:59.243	2026-08-29 16:21:57.678
cmtel91f300c4v33035f414tv	order.placed	{"userId": null, "orderId": "cmtel91dy00bpv3306kwqzaeo", "placedAt": "2026-08-29T16:21:57.958Z", "grandTotal": 740000, "orderNumber": "YSN-2026-0019", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:58	2026-08-29 16:21:59.265	2026-08-29 16:21:58
cmtel91wu00ckv330rcdyx2t9	order.placed	{"userId": "cmsx5rehl0005v3uwdwy4jud8", "orderId": "cmtel91w300cav330lc03jle1", "placedAt": "2026-08-29T16:21:58.611Z", "grandTotal": 580000, "orderNumber": "YSN-2026-0020", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": ["cmtel91w400ccv330or5jygdo"]}	DONE	0	\N	2026-08-29 16:21:58.638	2026-08-29 16:21:59.314	2026-08-29 16:21:58.638
cmtel92kz00dqv330aw5ly5lm	payment.awaiting_approval	{"amount": 314900, "status": "AWAITING_APPROVAL", "orderId": "cmtel92k700dgv330p5y5ga8q", "provider": "bank_transfer", "paymentId": "cmtel92kw00dpv330u43aukon"}	DONE	0	\N	2026-08-29 16:21:59.508	2026-08-29 16:22:00.744	2026-08-29 16:21:59.508
cmtel92l400drv330rttx3xwp	order.placed	{"userId": null, "orderId": "cmtel92k700dgv330p5y5ga8q", "placedAt": "2026-08-29T16:21:59.480Z", "grandTotal": 314900, "orderNumber": "YSN-2026-0022", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:59.512	2026-08-29 16:22:00.777	2026-08-29 16:21:59.512
cmtel92t100euv330clpqklwl	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel92qw00ehv330y86fmywr", "toStatus": "CONFIRMED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:21:59.798	2026-08-29 16:22:00.784	2026-08-29 16:21:59.798
cmtel92u600ezv33023yft0bb	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel92qw00ehv330y86fmywr", "toStatus": "PROCESSING", "fromStatus": "CONFIRMED", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:21:59.838	2026-08-29 16:22:00.791	2026-08-29 16:21:59.838
cmtel92vg00f4v330uy2uixz4	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel92qw00ehv330y86fmywr", "toStatus": "READY_TO_SHIP", "fromStatus": "PROCESSING", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:21:59.884	2026-08-29 16:22:00.796	2026-08-29 16:21:59.884
cmtel93na00grv3305so1ec5u	stitching.job_created	{"jobId": "cmtel93mw00gpv330fsxqtgj5", "orderId": "cmtel91zp00cqv330s4j0h185", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0003", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:22:00.887	2026-08-29 16:22:05.88	2026-08-29 16:22:00.887
cmtel6tlx004zv3mcx0kwc5wb	order.placed	{"userId": null, "orderId": "cmtel6tl6004pv3mcvvbxhrmf", "placedAt": "2026-08-29T16:20:14.538Z", "grandTotal": 334900, "orderNumber": "YSN-2026-0005", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:14.566	2026-08-29 16:20:15.895	2026-08-29 16:20:14.566
cmtel6toc005fv3mcl21kn07e	order.placed	{"userId": null, "orderId": "cmtel6tnk0055v3mcfhzmg933", "placedAt": "2026-08-29T16:20:14.624Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0006", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:14.653	2026-08-29 16:20:15.923	2026-08-29 16:20:14.653
cmtel6tqr005vv3mcfg8aowxs	order.placed	{"userId": null, "orderId": "cmtel6tq0005lv3mcrugsvjt4", "placedAt": "2026-08-29T16:20:14.712Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0007", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:14.74	2026-08-29 16:20:15.952	2026-08-29 16:20:14.74
cmtel6uoo009jv3mculu3c967	order.placed	{"userId": null, "orderId": "cmtel6umv0099v3mcrjd1fv3t", "placedAt": "2026-08-29T16:20:15.895Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0014", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:15.96	2026-08-29 16:20:18.008	2026-08-29 16:20:15.96
cmtel6uqq009vv3mcopyl8s9h	order.placed	{"userId": null, "orderId": "cmtel6up1009lv3mcqjd6m9m3", "placedAt": "2026-08-29T16:20:15.973Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0015", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:16.034	2026-08-29 16:20:18.036	2026-08-29 16:20:16.034
cmtel6usr00a7v3mc8p9hcnvt	order.placed	{"userId": null, "orderId": "cmtel6ur4009xv3mcviqk8d9m", "placedAt": "2026-08-29T16:20:16.048Z", "grandTotal": 460000, "orderNumber": "YSN-2026-0016", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:16.107	2026-08-29 16:20:18.063	2026-08-29 16:20:16.107
cmtel6uxc00arv3mcxhys0dip	order.placed	{"userId": null, "orderId": "cmtel6uwi00ahv3mcq7yznerb", "placedAt": "2026-08-29T16:20:16.242Z", "grandTotal": 95000, "orderNumber": "YSN-2026-0017", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:16.273	2026-08-29 16:20:18.092	2026-08-29 16:20:16.273
cmtel6v5300bpv3mcddprpwhb	order.placed	{"userId": null, "orderId": "cmtel6v3v00bav3mcqb2fe7hz", "placedAt": "2026-08-29T16:20:16.507Z", "grandTotal": 740000, "orderNumber": "YSN-2026-0018", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:16.552	2026-08-29 16:20:18.121	2026-08-29 16:20:16.552
cmtel6v6f00c6v3mcbmzs5n0h	order.placed	{"userId": null, "orderId": "cmtel6v5a00brv3mc2nka7y4w", "placedAt": "2026-08-29T16:20:16.559Z", "grandTotal": 740000, "orderNumber": "YSN-2026-0019", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:16.6	2026-08-29 16:20:18.146	2026-08-29 16:20:16.6
cmtel6voe00cmv3mcrec7kkos	order.placed	{"userId": "cmsx5rehl0005v3uwdwy4jud8", "orderId": "cmtel6vnl00ccv3mcs9zpofp9", "placedAt": "2026-08-29T16:20:17.216Z", "grandTotal": 580000, "orderNumber": "YSN-2026-0020", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": ["cmtel6vnl00cev3mcj166pwu3"]}	DONE	0	\N	2026-08-29 16:20:17.247	2026-08-29 16:20:18.205	2026-08-29 16:20:17.247
cmtel6vrr00d2v3mcvg014stj	order.placed	{"userId": null, "orderId": "cmtel6vqv00csv3mc56fa281q", "placedAt": "2026-08-29T16:20:17.335Z", "grandTotal": 550000, "orderNumber": "YSN-2026-0021", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": ["cmtel6vqv00cuv3mctx9s3htq"]}	DONE	0	\N	2026-08-29 16:20:17.367	2026-08-29 16:20:18.265	2026-08-29 16:20:17.367
cmtel6wf200dlv3mct2f12im8	stitching.job_created	{"jobId": "cmtel6wek00dev3mcu4x8ehe4", "orderId": "cmtel6vnl00ccv3mcs9zpofp9", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0002", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:20:18.207	2026-08-29 16:20:19.645	2026-08-29 16:20:18.207
cmtel6wfx00dsv3mchg89isis	payment.awaiting_approval	{"amount": 314900, "status": "AWAITING_APPROVAL", "orderId": "cmtel6wep00dhv3mci6uz9woq", "provider": "bank_transfer", "paymentId": "cmtel6wfr00drv3mc5oq7xj0s"}	DONE	0	\N	2026-08-29 16:20:18.237	2026-08-29 16:20:19.648	2026-08-29 16:20:18.237
cmtel6x3b00grv3mcmhvyl03o	order.placed	{"userId": null, "orderId": "cmtel6x2i00ghv3mc4qo0fa4y", "placedAt": "2026-08-29T16:20:19.050Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0026", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:49.642	2026-08-29 16:21:49.696	2026-08-29 16:20:19.08
cmtel90750075v330hns0knkc	order.placed	{"userId": null, "orderId": "cmtel9069006vv330kc0fqm6j", "placedAt": "2026-08-29T16:21:56.385Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0010", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:56.417	2026-08-29 16:21:57.17	2026-08-29 16:21:56.417
cmtel90tt008hv3301qlg9xb4	order.placed	{"userId": null, "orderId": "cmtel90kg0087v3302v62fhlx", "placedAt": "2026-08-29T16:21:56.896Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0011", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:57.233	2026-08-29 16:21:59.341	2026-08-29 16:21:57.233
cmtel90yt009hv330ecxmqhzy	order.placed	{"userId": null, "orderId": "cmtel90x90097v330syl1anrl", "placedAt": "2026-08-29T16:21:57.357Z", "grandTotal": 460000, "orderNumber": "YSN-2026-0014", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:57.413	2026-08-29 16:21:59.365	2026-08-29 16:21:57.413
cmtel6wgl00dxv3mce72iy8ok	stitching.job_created	{"jobId": "cmtel6wg100duv3mco0gc2ol6", "orderId": "cmtel6vqv00csv3mc56fa281q", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0003", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:20:18.261	2026-08-29 16:20:19.655	2026-08-29 16:20:18.261
cmtel6wq000f0v3mcwvokmviv	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel6wnl00env3mci83ezvzx", "toStatus": "CONFIRMED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:20:18.6	2026-08-29 16:20:19.66	2026-08-29 16:20:18.6
cmtel6wrd00f5v3mcj0xyycmy	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel6wnl00env3mci83ezvzx", "toStatus": "PROCESSING", "fromStatus": "CONFIRMED", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:20:18.649	2026-08-29 16:20:19.672	2026-08-29 16:20:18.649
cmtel6wv300fkv3mcmegfz97x	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel6wnl00env3mci83ezvzx", "toStatus": "DELIVERED", "fromStatus": "SHIPPED", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:20:18.783	2026-08-29 16:20:19.679	2026-08-29 16:20:18.783
cmtel92fs00d8v3305ydg8iay	stitching.job_created	{"jobId": "cmtel92fa00d6v3300mb8r3tk", "orderId": "cmtel91w300cav330lc03jle1", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0002", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:21:59.321	2026-08-29 16:22:00.798	2026-08-29 16:21:59.321
cmtel6wg700dwv3mcy4xgsnbo	order.placed	{"userId": null, "orderId": "cmtel6wep00dhv3mci6uz9woq", "placedAt": "2026-08-29T16:20:18.194Z", "grandTotal": 314900, "orderNumber": "YSN-2026-0022", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:18.248	2026-08-29 16:20:19.717	2026-08-29 16:20:18.248
cmtel6wih00dyv3mcfxp96nb0	payment.succeeded	{"amount": 314900, "status": "PAID", "orderId": "cmtel6wep00dhv3mci6uz9woq", "provider": "bank_transfer", "paymentId": "cmtel6wfr00drv3mc5oq7xj0s"}	DONE	0	\N	2026-08-29 16:20:18.33	2026-08-29 16:20:19.72	2026-08-29 16:20:18.33
cmtel6wld00egv3mcjdx1btxr	payment.awaiting_approval	{"amount": 314900, "status": "AWAITING_APPROVAL", "orderId": "cmtel6wkj00e6v3mcxbtdbobp", "provider": "bank_transfer", "paymentId": "cmtel6wla00efv3mcifulxyu2"}	DONE	0	\N	2026-08-29 16:20:18.433	2026-08-29 16:20:19.722	2026-08-29 16:20:18.433
cmtel6wli00ehv3mchl9bjk9s	order.placed	{"userId": null, "orderId": "cmtel6wkj00e6v3mcxbtdbobp", "placedAt": "2026-08-29T16:20:18.403Z", "grandTotal": 314900, "orderNumber": "YSN-2026-0023", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:18.438	2026-08-29 16:20:19.739	2026-08-29 16:20:18.438
cmtel6wod00exv3mcvi5y1bce	order.placed	{"userId": null, "orderId": "cmtel6wnl00env3mci83ezvzx", "placedAt": "2026-08-29T16:20:18.513Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0024", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:18.542	2026-08-29 16:20:19.757	2026-08-29 16:20:18.542
cmtel6wsn00fav3mcybnje4wx	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel6wnl00env3mci83ezvzx", "toStatus": "READY_TO_SHIP", "fromStatus": "PROCESSING", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:20:18.696	2026-08-29 16:20:19.768	2026-08-29 16:20:18.696
cmtel6wtw00ffv3mcmzunte0l	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel6wnl00env3mci83ezvzx", "toStatus": "SHIPPED", "fromStatus": "READY_TO_SHIP", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:20:18.741	2026-08-29 16:20:19.779	2026-08-29 16:20:18.741
cmtel6x0i00g9v3mcaudngv88	order.cancelled	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel6wyf00fsv3mcy3bqw9ue", "toStatus": "CANCELLED", "fromStatus": "PENDING", "orderNumber": "YSN-2026-0025"}	DONE	0	\N	2026-08-29 16:20:18.979	2026-08-29 16:20:19.788	2026-08-29 16:20:18.979
cmtel92mh00dsv330a45cgwfi	payment.succeeded	{"amount": 314900, "status": "PAID", "orderId": "cmtel92k700dgv330p5y5ga8q", "provider": "bank_transfer", "paymentId": "cmtel92kw00dpv330u43aukon"}	DONE	0	\N	2026-08-29 16:21:59.561	2026-08-29 16:22:00.801	2026-08-29 16:21:59.561
cmtel9jbs00lsv330lyjnbrhv	user.registered	{"name": "Merge", "email": "merge-1788020540707@example.com", "phone": null, "userId": "cmtel9jbn00lrv330t016j9bv"}	PENDING	0	\N	2026-08-29 16:22:21.208	\N	2026-08-29 16:22:21.208
cmtel6wzb00g2v3mchp0ck67w	order.placed	{"userId": null, "orderId": "cmtel6wyf00fsv3mcy3bqw9ue", "placedAt": "2026-08-29T16:20:18.903Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0025", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:20:36.995	2026-08-29 16:20:37.018	2026-08-29 16:20:18.936
cmtel723400ilv3mco8rn33ca	user.registered	{"name": "Merge", "email": "merge-1788020425068@example.com", "phone": null, "userId": "cmtel723000ikv3mcfyvqzsdd"}	DONE	0	\N	2026-08-29 16:20:25.552	2026-08-29 16:20:30.333	2026-08-29 16:20:25.552
cmtel7c8a00lsv3mc8b92c9ve	stitching.order_created	{"number": "STO-2026-0001", "stitchingOrderId": "cmtel7c7t00lpv3mc7n7o6lq7"}	DONE	0	\N	2026-08-29 16:20:38.699	2026-08-29 16:21:49.491	2026-08-29 16:20:38.699
cmtel7cac00lyv3mczovwzl3u	stitching.order_created	{"number": "STO-2026-0002", "stitchingOrderId": "cmtel7c9x00luv3mcmbg87vy5"}	DONE	0	\N	2026-08-29 16:20:38.772	2026-08-29 16:21:49.494	2026-08-29 16:20:38.772
cmtel7aux00kav3mc3kpwyaen	stitching.job_created	{"jobId": "cmtel7atc00k8v3mcqgt1cpk2", "orderId": "cmtel7aow00jwv3mc0wsdb24r", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0002", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:20:36.922	2026-08-29 16:20:37.028	2026-08-29 16:20:36.922
cmtel7arq00k6v3mc2t0chihr	order.placed	{"userId": "cmsx5rehl0005v3uwdwy4jud8", "orderId": "cmtel7aow00jwv3mc0wsdb24r", "placedAt": "2026-08-29T16:20:36.704Z", "grandTotal": 580000, "orderNumber": "YSN-2026-0002", "customerName": "Sana Iqbal", "customerEmail": null, "customerPhone": "+923445556666", "stitchingItemIds": ["cmtel7aox00jyv3mcm6j9ded9"]}	DONE	0	\N	2026-08-29 16:21:49.642	2026-08-29 16:21:49.734	2026-08-29 16:20:36.806
cmtel7b2n00kqv3mc4rnjw8ml	order.placed	{"userId": null, "orderId": "cmtel7b1p00kgv3mcf8jxz2cx", "placedAt": "2026-08-29T16:20:37.165Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0003", "customerName": "Sana Iqbal", "customerEmail": null, "customerPhone": "+923445556666", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:49.642	2026-08-29 16:21:49.74	2026-08-29 16:20:37.199
cmtel8zmo003lv330kpy74trx	order.placed	{"userId": null, "orderId": "cmtel8zlf003bv33076xe97xs", "placedAt": "2026-08-29T16:21:55.635Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0002", "customerName": "Ayesha Khan", "customerEmail": "ayesha@example.com", "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:55.68	2026-08-29 16:21:57.199	2026-08-29 16:21:55.68
cmtel8zpb0041v330w5w6wj6h	order.placed	{"userId": null, "orderId": "cmtel8zoe003rv330a1qritsm", "placedAt": "2026-08-29T16:21:55.742Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0003", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:55.775	2026-08-29 16:21:57.222	2026-08-29 16:21:55.775
cmtel7b9800kvv3mctyk425i7	stitching.job_stage_changed	{"jobId": "cmtel7atc00k8v3mcqgt1cpk2", "orderId": "cmtel7aow00jwv3mc0wsdb24r", "toStage": "CUTTING", "fromStage": "RECEIVED", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:20:37.437	2026-08-29 16:20:38.372	2026-08-29 16:20:37.437
cmtel7ba900l0v3mcwsx5xlk9	stitching.job_stage_changed	{"jobId": "cmtel7atc00k8v3mcqgt1cpk2", "orderId": "cmtel7aow00jwv3mc0wsdb24r", "toStage": "STITCHING", "fromStage": "CUTTING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:20:37.473	2026-08-29 16:20:38.393	2026-08-29 16:20:37.473
cmtel7bb900l5v3mcg71ulvee	stitching.job_stage_changed	{"jobId": "cmtel7atc00k8v3mcqgt1cpk2", "orderId": "cmtel7aow00jwv3mc0wsdb24r", "toStage": "QC", "fromStage": "STITCHING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:20:37.509	2026-08-29 16:20:38.408	2026-08-29 16:20:37.509
cmtel7bcq00lav3mc5ca69uqo	stitching.job_stage_changed	{"jobId": "cmtel7atc00k8v3mcqgt1cpk2", "orderId": "cmtel7aow00jwv3mc0wsdb24r", "toStage": "STITCHING", "fromStage": "QC", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:20:37.562	2026-08-29 16:20:38.431	2026-08-29 16:20:37.562
cmtel7c1500lgv3mcr4sukdqw	stitching.job_stage_changed	{"jobId": "cmtel7atc00k8v3mcqgt1cpk2", "orderId": "cmtel7aow00jwv3mc0wsdb24r", "toStage": "QC", "fromStage": "STITCHING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:20:38.442	2026-08-29 16:20:38.545	2026-08-29 16:20:38.442
cmtel7c3100llv3mc1c0bmsob	stitching.job_stage_changed	{"jobId": "cmtel7atc00k8v3mcqgt1cpk2", "orderId": "cmtel7aow00jwv3mc0wsdb24r", "toStage": "READY", "fromStage": "QC", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:20:38.51	2026-08-29 16:20:38.558	2026-08-29 16:20:38.51
cmtel931100fwv330t4t7n17e	order.placed	{"userId": null, "orderId": "cmtel930900fmv330anlzuy0y", "placedAt": "2026-08-29T16:22:00.057Z", "grandTotal": 609800, "orderNumber": "YSN-2026-0025", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:22:06.487	2026-08-29 16:22:06.507	2026-08-29 16:22:00.085
cmtel92p200eav3307waybge0	payment.awaiting_approval	{"amount": 314900, "status": "AWAITING_APPROVAL", "orderId": "cmtel92od00e0v3302h2byf85", "provider": "bank_transfer", "paymentId": "cmtel92oz00e9v33047nvpmfg"}	DONE	0	\N	2026-08-29 16:21:59.654	2026-08-29 16:22:00.729	2026-08-29 16:21:59.654
cmtel920i00d0v330qzdia5jv	order.placed	{"userId": null, "orderId": "cmtel91zp00cqv330s4j0h185", "placedAt": "2026-08-29T16:21:58.741Z", "grandTotal": 550000, "orderNumber": "YSN-2026-0021", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": ["cmtel91zq00csv330l442iof8"]}	DONE	0	\N	2026-08-29 16:21:58.771	2026-08-29 16:22:00.88	2026-08-29 16:21:58.771
cmtel92p600ebv33056hh4n3p	order.placed	{"userId": null, "orderId": "cmtel92od00e0v3302h2byf85", "placedAt": "2026-08-29T16:21:59.629Z", "grandTotal": 314900, "orderNumber": "YSN-2026-0023", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:59.659	2026-08-29 16:22:00.902	2026-08-29 16:21:59.659
cmtel92rm00erv330n6ajhbly	order.placed	{"userId": null, "orderId": "cmtel92qw00ehv330y86fmywr", "placedAt": "2026-08-29T16:21:59.720Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0024", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:21:59.747	2026-08-29 16:22:00.926	2026-08-29 16:21:59.747
cmtel92wh00f9v330bf75qqt2	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel92qw00ehv330y86fmywr", "toStatus": "SHIPPED", "fromStatus": "READY_TO_SHIP", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:21:59.922	2026-08-29 16:22:00.937	2026-08-29 16:21:59.922
cmtel92xl00fev330aszrlguy	order.status_changed	{"actorId": "cmsx5rcwn0000v3uwukkiufkd", "orderId": "cmtel92qw00ehv330y86fmywr", "toStatus": "DELIVERED", "fromStatus": "SHIPPED", "orderNumber": "YSN-2026-0024"}	DONE	0	\N	2026-08-29 16:21:59.961	2026-08-29 16:22:00.946	2026-08-29 16:21:59.961
cmtel934z00glv330eaf9qvjd	order.placed	{"userId": null, "orderId": "cmtel934800gbv33016ene9a3", "placedAt": "2026-08-29T16:22:00.200Z", "grandTotal": 324900, "orderNumber": "YSN-2026-0026", "customerName": "Ayesha Khan", "customerEmail": null, "customerPhone": "+923001234567", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:22:06.487	2026-08-29 16:22:06.513	2026-08-29 16:22:00.227
cmtel97uo00hbv330espu6fbn	order.placed	{"userId": "cmsx5rehl0005v3uwdwy4jud8", "orderId": "cmtel97sp00h1v330h0227knb", "placedAt": "2026-08-29T16:22:06.265Z", "grandTotal": 580000, "orderNumber": "YSN-2026-0002", "customerName": "Sana Iqbal", "customerEmail": null, "customerPhone": "+923445556666", "stitchingItemIds": ["cmtel97sp00h3v330uzhhezc2"]}	DONE	0	\N	2026-08-29 16:22:06.487	2026-08-29 16:22:06.63	2026-08-29 16:22:06.336
cmtel987300hvv33004xalfs8	order.placed	{"userId": null, "orderId": "cmtel985t00hlv3301agp8sox", "placedAt": "2026-08-29T16:22:06.737Z", "grandTotal": 329900, "orderNumber": "YSN-2026-0003", "customerName": "Sana Iqbal", "customerEmail": null, "customerPhone": "+923445556666", "stitchingItemIds": []}	DONE	0	\N	2026-08-29 16:22:06.783	2026-08-29 16:22:06.825	2026-08-29 16:22:06.783
cmtel98ik00iav330wrk6oviu	stitching.job_stage_changed	{"jobId": "cmtel97wd00hdv3303kne92js", "orderId": "cmtel97sp00h1v330h0227knb", "toStage": "QC", "fromStage": "STITCHING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:22:07.196	2026-08-29 16:22:07.963	2026-08-29 16:22:07.196
cmtel98l500ifv330l8te1dv5	stitching.job_stage_changed	{"jobId": "cmtel97wd00hdv3303kne92js", "orderId": "cmtel97sp00h1v330h0227knb", "toStage": "STITCHING", "fromStage": "QC", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:22:07.29	2026-08-29 16:22:07.98	2026-08-29 16:22:07.29
cmtel996d00ilv3307x0n4tqw	stitching.job_stage_changed	{"jobId": "cmtel97wd00hdv3303kne92js", "orderId": "cmtel97sp00h1v330h0227knb", "toStage": "QC", "fromStage": "STITCHING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:22:08.053	2026-08-29 16:22:08.113	2026-08-29 16:22:08.053
cmtel997l00iqv3301gu3p7of	stitching.job_stage_changed	{"jobId": "cmtel97wd00hdv3303kne92js", "orderId": "cmtel97sp00h1v330h0227knb", "toStage": "READY", "fromStage": "QC", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:22:08.098	2026-08-29 16:22:08.122	2026-08-29 16:22:08.098
cmtel99bb00ixv330onxrdw0h	stitching.order_created	{"number": "STO-2026-0001", "stitchingOrderId": "cmtel99ay00iuv330bewdfhyr"}	DONE	0	\N	2026-08-29 16:22:08.231	2026-08-29 16:22:13.635	2026-08-29 16:22:08.231
cmtel99ci00j3v330pdhicvpn	stitching.order_created	{"number": "STO-2026-0002", "stitchingOrderId": "cmtel99c900izv3303wqicc3g"}	DONE	0	\N	2026-08-29 16:22:08.275	2026-08-29 16:22:13.641	2026-08-29 16:22:08.275
cmtel97wz00hfv33059nc1hg4	stitching.job_created	{"jobId": "cmtel97wd00hdv3303kne92js", "orderId": "cmtel97sp00h1v330h0227knb", "toStage": "RECEIVED", "fromStage": null, "jobNumber": "JOB-2026-0002", "assignedTailorId": null, "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:22:06.419	2026-08-29 16:22:06.634	2026-08-29 16:22:06.419
cmtel98fl00i0v3309iwpoxbs	stitching.job_stage_changed	{"jobId": "cmtel97wd00hdv3303kne92js", "orderId": "cmtel97sp00h1v330h0227knb", "toStage": "CUTTING", "fromStage": "RECEIVED", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:22:07.089	2026-08-29 16:22:07.941	2026-08-29 16:22:07.089
cmtel98h200i5v330o1zw3mly	stitching.job_stage_changed	{"jobId": "cmtel97wd00hdv3303kne92js", "orderId": "cmtel97sp00h1v330h0227knb", "toStage": "STITCHING", "fromStage": "CUTTING", "jobNumber": "JOB-2026-0002", "assignedTailorId": "cmsx5rdyp0002v3uwz6wvwyci", "stitchingOrderId": null}	DONE	0	\N	2026-08-29 16:22:07.142	2026-08-29 16:22:07.953	2026-08-29 16:22:07.142
\.


--
-- Data for Name: Payment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Payment" (id, "orderId", provider, status, amount, currency, reference, "providerRef", meta, "receiptUrl", "failureReason", "approvedById", "paidAt", "refundedAt", "refundAmount", "createdAt", "updatedAt") FROM stdin;
cmsxjvk4f000hv3ugdd6bfk1r	cmsxjvk0f000bv3ug56i6yywp	cod	PENDING	1105000	PKR	COD-YSN-2026-0001-A9B017	\N	\N	\N	\N	\N	\N	\N	\N	2026-08-17 18:11:24.447	2026-08-17 18:11:24.447
\.


--
-- Data for Name: Permission; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Permission" (id, key, label, category, "createdAt") FROM stdin;
cmtdcv9c0000jv3gc78ejsd5k	account.change_own_password	Change their own password	Account	2026-08-28 19:39:31.968
cmtdcv9c2000kv3gcj2wrsu1b	settings.manage	Access the Settings screen	Administration	2026-08-28 19:39:31.97
cmtdcv9c5000lv3gc98oclo5k	roles.manage_permissions	Edit each role's granted permissions	Administration	2026-08-28 19:39:31.973
cmtdcv9c8000mv3gcqejwhst1	audit.view	View the audit log	Administration	2026-08-28 19:39:31.977
cmtdcv9cb000nv3gc5lvexutd	users.manage	Create and manage back-office user accounts	Administration	2026-08-28 19:39:31.979
cmtdcv98r0000v3gc7tpp6s13	analytics.view	View dashboard analytics	Dashboard	2026-08-28 19:39:31.851
cmtdcv9ai0001v3gcyejbvjph	reports.view	Export CSV reports	Dashboard	2026-08-28 19:39:31.914
cmtdcv9al0002v3gccdvt8f90	crm.manage	Manage leads, contacts and CRM	Customers	2026-08-28 19:39:31.918
cmtdcv9ap0003v3gcfssf3puk	orders.manage	Manage orders and shipments	Sales	2026-08-28 19:39:31.921
cmtdcv9at0004v3gcl37uspqk	payments.approve	Approve bank-transfer payments	Sales	2026-08-28 19:39:31.925
cmtdcv9aw0005v3gc3mqzqkyf	stitching.jobs.view_queue	View the tailor job queue	Production	2026-08-28 19:39:31.928
cmtdcv9az0006v3gcsvvd1n1j	stitching.jobs.change_stage	Move a job to its next stage	Production	2026-08-28 19:39:31.931
cmtdcv9b20007v3gcowra5msn	stitching.jobs.manage_own	Change stage on own assigned jobs only	Production	2026-08-28 19:39:31.934
cmtdcv9b50008v3gcsoz54qwd	stitching.jobs.manage_all	Change stage on any job, regardless of assignment	Production	2026-08-28 19:39:31.937
cmtdcv9b80009v3gcleyrl7dq	stitching.jobs.assign	Assign jobs to a tailor	Production	2026-08-28 19:39:31.94
cmtdcv9bb000av3gch3w8cpz3	stitching.bookings.manage	Manage customer's-own-fabric stitching bookings	Production	2026-08-28 19:39:31.943
cmtdcv9be000bv3gc3bsznqng	stitching.designs.manage	Manage the stitching style/design catalogue	Production	2026-08-28 19:39:31.946
cmtdcv9bh000cv3gcmq2sy14n	catalog.manage	Manage products, categories and import	Catalogue	2026-08-28 19:39:31.949
cmtdcv9bj000dv3gciael0qnp	inventory.manage	Adjust and view stock levels	Catalogue	2026-08-28 19:39:31.952
cmtdcv9bm000ev3gcra293v7p	inventory.view_cost	See cost prices and margins	Catalogue	2026-08-28 19:39:31.954
cmtdcv9bp000fv3gcrft0ezm1	inventory.count	Run stock counts	Catalogue	2026-08-28 19:39:31.957
cmtdcv9bs000gv3gclojnfxs8	measurements.manage_blueprints	Manage garment types, measurement fields and size charts	Catalogue	2026-08-28 19:39:31.96
cmtdcv9bv000hv3gcfelqf3dt	suppliers.manage	Manage suppliers	Purchasing	2026-08-28 19:39:31.963
cmtdcv9by000iv3gcubo6p58i	purchasing.manage	Create and receive purchase orders	Purchasing	2026-08-28 19:39:31.966
\.


--
-- Data for Name: Product; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Product" (id, slug, kind, status, "categoryId", "basePrice", "compareAtPrice", brand, fabric, season, tags, "pieceCount", "fabricMeters", "stitchingAvailable", "garmentTypeId", "featuredRank", "publishedAt", "createdAt", "updatedAt") FROM stdin;
cmsx5rf560060v3uww4d8aqk4	mens-wash-n-wear-2-piece-grey	UNSTITCHED	ACTIVE	cmsx5revc0046v3uw6cacpji6	320000	\N	Yaseen	wash-n-wear	all-season	{menswear,formal}	2	7	t	\N	50	2026-08-17 11:36:16.744	2026-08-17 11:36:16.746	2026-08-17 11:36:16.746
cmsxkmqnw0003v33od952yk7m	hhhc	UNSTITCHED	ACTIVE	cmsx5retl003rv3uw2w0v7gog	100000	90000	\N	khaddar	winter	{"hfhh v hjj"}	3	7	t	\N	1	2026-08-17 18:32:32.633	2026-08-17 18:32:32.636	2026-08-17 18:33:08.187
cmt015fy90007v3g0mt2amifh	jhbuv	UNSTITCHED	DRAFT	\N	46548900	\N	\N	\N	\N	{}	\N	\N	f	\N	0	\N	2026-08-19 11:50:31.421	2026-08-19 11:50:31.421
cmt3o0gbr0005v3y4km03dvsy	test-2	UNSTITCHED	DRAFT	\N	1000000	12000000	\N	lawn	summer	{}	3	9	t	\N	0	\N	2026-08-22 00:53:48.327	2026-08-22 00:54:06.663
cmsx5rewv004cv3uwtt13zsn2	embroidered-lawn-3-piece-ferozi	UNSTITCHED	ACTIVE	cmsx5retl003rv3uw2w0v7gog	450000	550000	Yaseen	lawn	summer	{embroidered,summer,festive}	3	9.5	t	\N	100	2026-08-17 11:36:16.4	2026-08-17 11:36:16.447	2026-08-28 23:11:56.103
cmsx5rezv004mv3uweoe5c0y7	printed-lawn-2-piece-rose	UNSTITCHED	ACTIVE	cmsx5retl003rv3uw2w0v7gog	280000	\N	Yaseen	lawn	summer	{printed,everyday}	2	6.5	t	\N	60	2026-08-17 11:36:16.553	2026-08-17 11:36:16.555	2026-08-28 23:11:56.169
cmsx5rf12004wv3uwuhgxiut8	khaddar-3-piece-winter-olive	UNSTITCHED	ACTIVE	cmsx5retl003rv3uw2w0v7gog	520000	\N	Yaseen	khaddar	winter	{winter,warm}	3	10	t	\N	70	2026-08-17 11:36:16.595	2026-08-17 11:36:16.598	2026-08-28 23:11:56.198
cmsx5rf250056v3uwa9eo18j0	ready-kurta-white-cotton	STITCHED	ACTIVE	cmsx5reuj003wv3uwvx7hg9cp	299900	349900	Yaseen	cotton	summer	{ready,basic}	\N	\N	f	\N	80	2026-08-17 11:36:16.635	2026-08-17 11:36:16.637	2026-08-28 23:11:56.23
cmsx5rf39005mv3uwd46r8oc1	ready-chiffon-formal-maroon	STITCHED	ACTIVE	cmsx5reuj003wv3uwvx7hg9cp	1250000	\N	Yaseen	chiffon	festive	{formal,wedding,festive}	\N	\N	f	\N	90	2026-08-17 11:36:16.675	2026-08-17 11:36:16.677	2026-08-28 23:11:56.269
cmt1dpuqs005qv3iof5gwl41a	kids-wash-n-wear-2-piece-grey	UNSTITCHED	ACTIVE	cmt1dpumy0046v3iouh4skyrx	320000	\N	Yaseen	wash-n-wear	all-season	{kids-wear,casual}	2	7	t	\N	50	2026-08-20 10:30:05.282	2026-08-20 10:30:05.284	2026-08-28 23:11:56.299
cmsx5rf70006av3uw11qoymk7	stitching-kameez-standard	STITCHING_SERVICE	ACTIVE	cmsx5reuz0041v3uwyo3xh5be	120000	\N	\N	\N	\N	{}	\N	\N	f	cmsx5rek50007v3uwzg0vl4hk	0	2026-08-17 11:36:16.811	2026-08-17 11:36:16.812	2026-08-28 23:11:56.33
cmsx5rf8h006kv3uw3x2zmbsl	stitching-kameez-premium	STITCHING_SERVICE	ACTIVE	cmsx5reuz0041v3uwyo3xh5be	250000	\N	\N	\N	\N	{}	\N	\N	f	cmsx5rek50007v3uwzg0vl4hk	0	2026-08-17 11:36:16.863	2026-08-17 11:36:16.865	2026-08-28 23:11:56.349
cmsx5rf9u006uv3uwk0mdko1w	stitching-shalwar-standard	STITCHING_SERVICE	ACTIVE	cmsx5reuz0041v3uwyo3xh5be	70000	\N	\N	\N	\N	{}	\N	\N	f	cmsx5rem6000sv3uw27ole3ls	0	2026-08-17 11:36:16.91	2026-08-17 11:36:16.914	2026-08-28 23:11:56.367
cmsx5rfb40074v3uwjgw1jqaz	stitching-trouser-standard	STITCHING_SERVICE	ACTIVE	cmsx5reuz0041v3uwyo3xh5be	80000	\N	\N	\N	\N	{}	\N	\N	f	cmsx5remv0013v3uwg59rhzgv	0	2026-08-17 11:36:16.959	2026-08-17 11:36:16.96	2026-08-28 23:11:56.387
cmsx5rfcf007ev3uwymhawr74	stitching-kurta-mens	STITCHING_SERVICE	ACTIVE	cmsx5reuz0041v3uwyo3xh5be	150000	\N	\N	\N	\N	{}	\N	\N	f	cmsx5rent001gv3uwu7e5gsav	0	2026-08-17 11:36:17.005	2026-08-17 11:36:17.007	2026-08-28 23:11:56.418
\.


--
-- Data for Name: ProductGarmentType; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ProductGarmentType" ("productId", "garmentTypeId") FROM stdin;
cmsx5rewv004cv3uwtt13zsn2	cmsx5rek50007v3uwzg0vl4hk
cmsx5rewv004cv3uwtt13zsn2	cmsx5rem6000sv3uw27ole3ls
cmsx5rewv004cv3uwtt13zsn2	cmsx5remv0013v3uwg59rhzgv
cmsx5rezv004mv3uweoe5c0y7	cmsx5rek50007v3uwzg0vl4hk
cmsx5rezv004mv3uweoe5c0y7	cmsx5remv0013v3uwg59rhzgv
cmsx5rf12004wv3uwuhgxiut8	cmsx5rek50007v3uwzg0vl4hk
cmsx5rf12004wv3uwuhgxiut8	cmsx5rem6000sv3uw27ole3ls
cmsx5rf560060v3uww4d8aqk4	cmsx5rent001gv3uwu7e5gsav
cmsx5rf560060v3uww4d8aqk4	cmsx5rem6000sv3uw27ole3ls
cmsxkmqnw0003v33od952yk7m	cmsx5rek50007v3uwzg0vl4hk
cmsxkmqnw0003v33od952yk7m	cmsx5rem6000sv3uw27ole3ls
cmsxkmqnw0003v33od952yk7m	cmsx5remv0013v3uwg59rhzgv
cmsxkmqnw0003v33od952yk7m	cmsx5rent001gv3uwu7e5gsav
cmsxkmqnw0003v33od952yk7m	cmsx5reon001tv3uw4yhfp4if
cmsxkmqnw0003v33od952yk7m	cmsx5rep30022v3uwxeh1yape
cmt1dpuqs005qv3iof5gwl41a	cmsx5rent001gv3uwu7e5gsav
cmt1dpuqs005qv3iof5gwl41a	cmsx5rem6000sv3uw27ole3ls
cmt3o0gbr0005v3y4km03dvsy	cmsx5rem6000sv3uw27ole3ls
cmt3o0gbr0005v3y4km03dvsy	cmsx5remv0013v3uwg59rhzgv
cmt3o0gbr0005v3y4km03dvsy	cmsx5rek50007v3uwzg0vl4hk
\.


--
-- Data for Name: ProductImage; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ProductImage" (id, "productId", "variantId", url, alt, "order", "isPrimary", "createdAt") FROM stdin;
cmsx5rezg004kv3uwapicl7fq	cmsx5rewv004cv3uwtt13zsn2	\N	/placeholders/lawn-ferozi.svg	3-Piece Embroidered Lawn Suit — Ferozi	0	t	2026-08-17 11:36:16.54
cmsx5rf0u004uv3uwxno1y440	cmsx5rezv004mv3uweoe5c0y7	\N	/placeholders/lawn-rose.svg	2-Piece Printed Lawn — Rose	0	t	2026-08-17 11:36:16.59
cmsx5rf1z0054v3uwhaz3dt09	cmsx5rf12004wv3uwuhgxiut8	\N	/placeholders/khaddar-olive.svg	3-Piece Khaddar Winter Suit — Olive	0	t	2026-08-17 11:36:16.631
cmsx5rf33005kv3uw8s1enmdv	cmsx5rf250056v3uwa9eo18j0	\N	/placeholders/cotton-white.svg	Ready-to-Wear Cotton Kurta — White	0	t	2026-08-17 11:36:16.672
cmsx5rf51005yv3uwgi9rjcqo	cmsx5rf39005mv3uwd46r8oc1	\N	/placeholders/chiffon-maroon.svg	Stitched Chiffon Formal — Maroon	0	t	2026-08-17 11:36:16.741
cmsx5rf6v0068v3uwwi6rtx01	cmsx5rf560060v3uww4d8aqk4	\N	/placeholders/washnwear-grey.svg	Men's Wash & Wear 2-Piece — Grey	0	t	2026-08-17 11:36:16.807
cmsx5rf86006iv3uw8p05u62g	cmsx5rf70006av3uw11qoymk7	\N	/placeholders/stitching-service.svg	Kameez Stitching — Standard	0	t	2026-08-17 11:36:16.854
cmsx5rf9m006sv3uwuimaoz5y	cmsx5rf8h006kv3uw3x2zmbsl	\N	/placeholders/stitching-service.svg	Kameez Stitching — Premium	0	t	2026-08-17 11:36:16.906
cmsx5rfay0072v3uw442vgxu9	cmsx5rf9u006uv3uwk0mdko1w	\N	/placeholders/stitching-service.svg	Shalwar Stitching	0	t	2026-08-17 11:36:16.954
cmsx5rfc8007cv3uwux2prpvl	cmsx5rfb40074v3uwjgw1jqaz	\N	/placeholders/stitching-service.svg	Trouser Stitching	0	t	2026-08-17 11:36:17
cmsx5rfdc007mv3uw3edc7eg3	cmsx5rfcf007ev3uwymhawr74	\N	/placeholders/stitching-service.svg	Men's Kurta Stitching	0	t	2026-08-17 11:36:17.04
cmsxkna8p000av33oc0b169xv	cmsxkmqnw0003v33od952yk7m	\N	http://localhost:3001/api/v1/files/products/2026/08/screenshot-20260806-223755-457330c9.png	Screenshot_20260806_223755	0	t	2026-08-17 18:32:58.01
cmt1dpus4005yv3iovgj8k72p	cmt1dpuqs005qv3iof5gwl41a	\N	/placeholders/washnwear-grey.svg	Kids' Wash & Wear 2-Piece — Grey	0	t	2026-08-20 10:30:05.333
cmt1y9tab004kv3p4hsn7qzv6	cmsx5rewv004cv3uwtt13zsn2	\N	/placeholders/lawn-ferozi-detail.svg	3-Piece Embroidered Lawn Suit — Ferozi	1	f	2026-08-20 20:05:28.835
cmt1y9tba004uv3p413j7ucgi	cmsx5rezv004mv3uweoe5c0y7	\N	/placeholders/lawn-rose-detail.svg	2-Piece Printed Lawn — Rose	1	f	2026-08-20 20:05:28.87
cmt1y9tc50054v3p45iaootb0	cmsx5rf12004wv3uwuhgxiut8	\N	/placeholders/khaddar-olive-detail.svg	3-Piece Khaddar Winter Suit — Olive	1	f	2026-08-20 20:05:28.901
cmt1y9tcz005kv3p4bvn40uxa	cmsx5rf250056v3uwa9eo18j0	\N	/placeholders/cotton-white-detail.svg	Ready-to-Wear Cotton Kurta — White	1	f	2026-08-20 20:05:28.931
cmt1y9tdr005yv3p4il81s5ut	cmsx5rf39005mv3uwd46r8oc1	\N	/placeholders/chiffon-maroon-detail.svg	Stitched Chiffon Formal — Maroon	1	f	2026-08-20 20:05:28.96
cmt1y9teq0068v3p4q0y5eo20	cmt1dpuqs005qv3iof5gwl41a	\N	/placeholders/washnwear-grey-detail.svg	Kids' Wash & Wear 2-Piece — Grey	1	f	2026-08-20 20:05:28.995
cmt1y9tfj006iv3p49ja9fym7	cmsx5rf70006av3uw11qoymk7	\N	/placeholders/stitching-service-detail.svg	Kameez Stitching — Standard	1	f	2026-08-20 20:05:29.023
cmt1y9tg5006sv3p4w1ngakoj	cmsx5rf8h006kv3uw3x2zmbsl	\N	/placeholders/stitching-service-detail.svg	Kameez Stitching — Premium	1	f	2026-08-20 20:05:29.046
cmt1y9tgq0072v3p4d5l6vtpz	cmsx5rf9u006uv3uwk0mdko1w	\N	/placeholders/stitching-service-detail.svg	Shalwar Stitching	1	f	2026-08-20 20:05:29.067
cmt1y9tia007cv3p47h0oyylu	cmsx5rfb40074v3uwjgw1jqaz	\N	/placeholders/stitching-service-detail.svg	Trouser Stitching	1	f	2026-08-20 20:05:29.123
cmt1y9tjp007mv3p4t0dg46sw	cmsx5rfcf007ev3uwymhawr74	\N	/placeholders/stitching-service-detail.svg	Men's Kurta Stitching	1	f	2026-08-20 20:05:29.173
cmt3o2eh7000ev3y4mx19nbdw	cmt3o0gbr0005v3y4km03dvsy	\N	http://localhost:3001/api/v1/files/products/2026/08/screenshot-20260806-223755-a41c13b5.png	Screenshot_20260806_223755	0	t	2026-08-22 00:55:19.244
\.


--
-- Data for Name: ProductTranslation; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ProductTranslation" (id, "productId", locale, name, description, "careInstructions", "metaTitle", "metaDescription") FROM stdin;
cmsx5rf5b0062v3uwovea5wjr	cmsx5rf560060v3uww4d8aqk4	en	Men's Wash & Wear 2-Piece — Grey	Classic wash & wear shalwar kameez fabric. Needs no ironing after a wash.	\N	\N	\N
cmsx5rf5g0064v3uwg4lbspzy	cmsx5rf560060v3uww4d8aqk4	ur	مردانہ واش اینڈ ویئر ٹو پیس — سرمئی	کلاسک واش اینڈ ویئر شلوار قمیض کا کپڑا۔	\N	\N	\N
cmsxkmqnw0004v33o6z6ho6yt	cmsxkmqnw0003v33od952yk7m	en	Hhhc	vhvfh h	bbbc c	\N	\N
cmsxkmqnw0005v33o3hav91n2	cmsxkmqnw0003v33od952yk7m	ur	bvbbv	bbv	bbbvz	\N	\N
cmt015fya0008v3g0bnl1g0xw	cmt015fy90007v3g0mt2amifh	en	jhbuv	\N	\N	\N	\N
cmt015fya0009v3g04bb05ucx	cmt015fy90007v3g0mt2amifh	ur	-	\N	\N	\N	\N
cmsx5rf2a0058v3uw4fa4lbw3	cmsx5rf250056v3uwa9eo18j0	en	Ready-to-Wear Cotton Kurta — White	A plain white cotton kurta, straight cut with side slits. Machine washable.	\N	\N	\N
cmsx5rf2e005av3uwdbqi5dnb	cmsx5rf250056v3uwa9eo18j0	ur	تیار سوتی کرتا — سفید	سادہ سفید سوتی کرتا، سیدھا کٹ اور سائیڈ چاک کے ساتھ۔	\N	\N	\N
cmsx5rf3e005ov3uwufkugc4u	cmsx5rf39005mv3uwd46r8oc1	en	Stitched Chiffon Formal — Maroon	Fully stitched chiffon formal with hand-embellished neckline and a matching slip.	\N	\N	\N
cmsx5rf3i005qv3uw3ojwmbuy	cmsx5rf39005mv3uwd46r8oc1	ur	سلا ہوا شیفون فارمل — مرون	مکمل سلا ہوا شیفون فارمل، ہاتھ کی کڑھائی والے گلے کے ساتھ۔	\N	\N	\N
cmt1dpuqw005sv3io2f7r8ioa	cmt1dpuqs005qv3iof5gwl41a	en	Kids' Wash & Wear 2-Piece — Grey	Classic wash & wear shalwar kameez fabric for kids. Needs no ironing after a wash.	\N	\N	\N
cmsx5rf8n006mv3uwhoyx2jv5	cmsx5rf8h006kv3uw3x2zmbsl	en	Kameez Stitching — Premium	Hand-finished seams, full lining and a fitting check before dispatch. Ready in 10 working days.	\N	\N	\N
cmsx5rf8q006ov3uwk5suhgej	cmsx5rf8h006kv3uw3x2zmbsl	ur	قمیض سلائی — پریمیم	ہاتھ کی فنشنگ، مکمل استر اور روانگی سے پہلے فٹنگ چیک۔ دس کام کے دنوں میں تیار۔	\N	\N	\N
cmsx5rfa3006wv3uwjb7xxsml	cmsx5rf9u006uv3uwk0mdko1w	en	Shalwar Stitching	Shalwar stitched to your measurements in your chosen style.	\N	\N	\N
cmsx5rfa9006yv3uwrchkyjin	cmsx5rf9u006uv3uwk0mdko1w	ur	شلوار سلائی	آپ کے ناپ اور پسندیدہ اسٹائل میں شلوار کی سلائی۔	\N	\N	\N
cmt3o0gbs0006v3y41l8tmqpo	cmt3o0gbr0005v3y4km03dvsy	en	test 2	\N	\N	\N	\N
cmsx5rfba0076v3uw22lqs2rb	cmsx5rfb40074v3uwjgw1jqaz	en	Trouser Stitching	Trouser stitched to your measurements — straight, cigarette or palazzo.	\N	\N	\N
cmsx5rexb004ev3uwxbnfnwgc	cmsx5rewv004cv3uwtt13zsn2	en	3-Piece Embroidered Lawn Suit — Ferozi	Embroidered lawn front with printed back and sleeves, cambric trouser and a chiffon dupatta. Cut generously so it can be stitched to any style.	\N	\N	\N
cmsx5rexn004gv3uw6uytqh0m	cmsx5rewv004cv3uwtt13zsn2	ur	تھری پیس کڑھائی والا لان سوٹ — فیروزی	کڑھائی والا لان فرنٹ، پرنٹڈ بیک اور آستین، کیمبرک ٹراؤزر اور شیفون دوپٹہ۔	\N	\N	\N
cmsx5rf00004ov3uwjo859j8j	cmsx5rezv004mv3uweoe5c0y7	en	2-Piece Printed Lawn — Rose	Everyday printed lawn shirt and trouser fabric. Colour-fast and light enough for Karachi summers.	\N	\N	\N
cmsx5rf05004qv3uwm7x9pj5q	cmsx5rezv004mv3uweoe5c0y7	ur	ٹو پیس پرنٹڈ لان — گلابی	روزمرہ کے لیے پرنٹڈ لان شرٹ اور ٹراؤزر کا کپڑا۔	\N	\N	\N
cmt1dpur1005uv3iojkley9t0	cmt1dpuqs005qv3iof5gwl41a	ur	بچوں کے کپڑے واش اینڈ ویئر ٹو پیس — سرمئی	بچوں کے لیے کلاسک واش اینڈ ویئر شلوار قمیض کا کپڑا۔	\N	\N	\N
cmsx5rfbf0078v3uwvf8odcx2	cmsx5rfb40074v3uwjgw1jqaz	ur	ٹراؤزر سلائی	آپ کے ناپ کے مطابق ٹراؤزر کی سلائی۔	\N	\N	\N
cmsx5rf17004yv3uwmf6hbq0j	cmsx5rf12004wv3uwuhgxiut8	en	3-Piece Khaddar Winter Suit — Olive	Warm khaddar shirt and trouser with a woollen shawl. Suited to Lahore and Islamabad winters.	\N	\N	\N
cmsx5rf1a0050v3uwv6n7uer5	cmsx5rf12004wv3uwuhgxiut8	ur	تھری پیس کھدر ونٹر سوٹ — زیتونی	گرم کھدر شرٹ اور ٹراؤزر کے ساتھ اونی شال۔	\N	\N	\N
cmsx5rf7a006cv3uw5fx9t6cm	cmsx5rf70006av3uw11qoymk7	en	Kameez Stitching — Standard	Machine-stitched kameez to your measurements. Ready in 7 working days.	\N	\N	\N
cmsx5rf7h006ev3uwj6f4hp9o	cmsx5rf70006av3uw11qoymk7	ur	قمیض سلائی — اسٹینڈرڈ	آپ کے ناپ کے مطابق مشین سلائی۔ سات کام کے دنوں میں تیار۔	\N	\N	\N
cmsx5rfcl007gv3uw5e8we3uy	cmsx5rfcf007ev3uwymhawr74	en	Men's Kurta Stitching	Men's kurta stitched to measure with a collar or band neck.	\N	\N	\N
cmsx5rfcs007iv3uw5x2n1gnj	cmsx5rfcf007ev3uwymhawr74	ur	مردانہ کرتا سلائی	مردانہ کرتا، کالر یا بینڈ گلے کے ساتھ، ناپ کے مطابق۔	\N	\N	\N
\.


--
-- Data for Name: ProductVariant; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ProductVariant" (id, "productId", sku, size, color, "colorHex", "priceOverride", stock, "lowStockThreshold", "isActive", "order", "createdAt", "updatedAt", barcode, "costPrice", "lastReceivedAt", "preferredSupplierId", "reorderPoint", "reorderQuantity") FROM stdin;
cmsxkmqnw0006v33ojh3kgtb1	cmsxkmqnw0003v33od952yk7m	KFJSN	m	bl	whjh	10000	8	3	t	0	2026-08-17 18:32:32.636	2026-08-17 18:33:08.21	\N	0	\N	\N	\N	\N
cmsx5rf2v005iv3uwfemuzv4e	cmsx5rf250056v3uwa9eo18j0	READY-KURTA-WHITE-COTTON-WHITE-XL	XL	White	#f7f7f2	\N	8	3	t	3	2026-08-17 11:36:16.663	2026-08-20 20:05:28.926	\N	0	\N	\N	\N	\N
cmsx5rf3n005sv3uwf8i72tnx	cmsx5rf39005mv3uwd46r8oc1	READY-CHIFFON-FORMAL-MAROON-MAROON-S	S	Maroon	#7b2233	\N	4	3	t	0	2026-08-17 11:36:16.691	2026-08-20 20:05:28.945	\N	0	\N	\N	\N	\N
cmsx5rf42005uv3uw7xbhosi5	cmsx5rf39005mv3uwd46r8oc1	READY-CHIFFON-FORMAL-MAROON-MAROON-M	M	Maroon	#7b2233	\N	6	3	t	1	2026-08-17 11:36:16.706	2026-08-20 20:05:28.948	\N	0	\N	\N	\N	\N
cmsx5rf4a005wv3uwppkmoz6j	cmsx5rf39005mv3uwd46r8oc1	READY-CHIFFON-FORMAL-MAROON-MAROON-L	L	Maroon	#7b2233	\N	3	3	t	2	2026-08-17 11:36:16.713	2026-08-20 20:05:28.954	\N	0	\N	\N	\N	\N
cmt1dpur4005wv3ionvxe0ipt	cmt1dpuqs005qv3iof5gwl41a	KIDS-WASH-N-WEAR-2-PIECE-GREY-GREY-FREE-SIZE	Free size	Grey	#6d6f74	\N	30	3	t	0	2026-08-20 10:30:05.296	2026-08-20 20:05:28.977	\N	0	\N	\N	\N	\N
cmsx5rf1f0052v3uwsuv23wed	cmsx5rf12004wv3uwuhgxiut8	KHADDAR-3-PIECE-WINTER-OLIVE-OLIVE-FREE-SIZE	Free size	Olive	#6b7d4a	\N	18	3	t	0	2026-08-17 11:36:16.611	2026-08-29 16:22:00.903	\N	0	\N	\N	\N	\N
cmsx5rf2m005ev3uwckqmzj7j	cmsx5rf250056v3uwa9eo18j0	READY-KURTA-WHITE-COTTON-WHITE-M	M	White	#f7f7f2	\N	20	3	t	1	2026-08-17 11:36:16.654	2026-08-29 16:22:00.921	\N	0	\N	\N	\N	\N
cmsx5rf2r005gv3uwlr9kwh43	cmsx5rf250056v3uwa9eo18j0	READY-KURTA-WHITE-COTTON-WHITE-L	L	White	#f7f7f2	\N	15	3	t	2	2026-08-17 11:36:16.659	2026-08-29 16:22:00.934	\N	0	\N	\N	\N	\N
cmsx5rfcw007kv3uwmbuiq6zn	cmsx5rfcf007ev3uwymhawr74	SVC-STITCHING-KURTA-MENS	\N	\N	\N	\N	101	3	t	0	2026-08-17 11:36:17.024	2026-08-29 16:22:00.945	\N	0	\N	\N	\N	\N
cmsx5rf7m006gv3uwoukrbm7y	cmsx5rf70006av3uw11qoymk7	SVC-STITCHING-KAMEEZ-STANDARD	\N	\N	\N	\N	101	3	t	0	2026-08-17 11:36:16.834	2026-08-29 16:18:52.654	\N	0	\N	\N	\N	\N
cmsx5rfak0070v3uwz9neyuw2	cmsx5rf9u006uv3uwk0mdko1w	SVC-STITCHING-SHALWAR-STANDARD	\N	\N	\N	\N	101	3	t	0	2026-08-17 11:36:16.94	2026-08-29 16:20:19.836	\N	0	\N	\N	\N	\N
cmsx5rf09004sv3uwcpkuuky5	cmsx5rezv004mv3uweoe5c0y7	PRINTED-LAWN-2-PIECE-ROSE-ROSE-FREE-SIZE	Free size	Rose	#c96a83	\N	40	3	t	0	2026-08-17 11:36:16.569	2026-08-29 16:22:00.968	\N	0	\N	\N	\N	\N
cmsx5rexv004iv3uwhtv4yelr	cmsx5rewv004cv3uwtt13zsn2	EMBROIDERED-LAWN-3-PIECE-FEROZI-FEROZI-FREE-SIZE	Free size	Ferozi	#2e8b9a	\N	199	3	t	0	2026-08-17 11:36:16.483	2026-08-29 16:22:06.307	\N	0	\N	\N	\N	\N
cmsx5rf2i005cv3uwk782tbox	cmsx5rf250056v3uwa9eo18j0	READY-KURTA-WHITE-COTTON-WHITE-S	S	White	#f7f7f2	\N	9	3	t	0	2026-08-17 11:36:16.65	2026-08-29 16:22:06.76	\N	0	\N	\N	\N	\N
cmsx5rfbm007av3uw6wjrv9mo	cmsx5rfb40074v3uwjgw1jqaz	SVC-STITCHING-TROUSER-STANDARD	\N	\N	\N	\N	10	3	t	0	2026-08-17 11:36:16.979	2026-08-29 16:20:45.656	\N	0	\N	\N	\N	\N
cmsx5rf5m0066v3uwsl6l4ag9	cmsx5rf560060v3uww4d8aqk4	MENS-WASH-N-WEAR-2-PIECE-GREY-GREY-FREE-SIZE	Free size	Grey	#6d6f74	\N	10	3	t	0	2026-08-17 11:36:16.763	2026-08-29 16:22:27.117	\N	0	\N	\N	\N	\N
cmsx5rf8w006qv3uw4kyfgcaf	cmsx5rf8h006kv3uw3x2zmbsl	SVC-STITCHING-KAMEEZ-PREMIUM	\N	\N	\N	\N	10	3	t	0	2026-08-17 11:36:16.881	2026-08-29 16:19:22.835	\N	0	\N	\N	\N	\N
\.


--
-- Data for Name: PurchaseOrder; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PurchaseOrder" (id, number, "supplierId", status, currency, subtotal, "freightCost", "dutyCost", "otherCost", total, "expectedAt", "sentAt", "receivedAt", "cancelledAt", notes, "createdById", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: PurchaseOrderItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PurchaseOrderItem" (id, "purchaseOrderId", "variantId", "quantityOrdered", "quantityReceived", "unitCost", "lineTotal", note) FROM stdin;
\.


--
-- Data for Name: RefreshToken; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."RefreshToken" (id, "userId", "tokenHash", "expiresAt", "revokedAt", "userAgent", ip, "createdAt") FROM stdin;
cmsx6j5c40007v3ug2ti0bkkx	cmsx5rehl0005v3uwdwy4jud8	2e74b045131d18f09fb6a106117c67df5f0bb5c3092c794335837d1579859eec	2026-09-16 11:57:50.397	\N	\N	\N	2026-08-17 11:57:50.402
cmt3nwvs80003v3y4p9vwrzgz	cmsx5rcwn0000v3uwukkiufkd	587b96649fec0a5073801de5b38e54375c2da4e1737d19afc6b1f06c8139a6ad	2026-09-21 00:51:01.733	2026-08-22 21:55:30.683	\N	\N	2026-08-22 00:51:01.736
cmsxjzxyw0005v3z4gtejbbhy	cmsx5rcwn0000v3uwukkiufkd	2e6b79a0f2a11dada02085d73a715acdd05d44399c272dafb430a4f23025d534	2026-09-16 18:14:49.011	\N	\N	\N	2026-08-17 18:14:49.015
cmsxjzxyq0003v3z4r4wy27oh	cmsx5rcwn0000v3uwukkiufkd	595b17a31096d0d9597f856599d96d938fedba6670be090c0dfbe49271a0e62c	2026-09-16 18:14:48.999	\N	\N	\N	2026-08-17 18:14:49.005
cmsx5rs4k0001v3ugkduou6oa	cmsx5rcwn0000v3uwukkiufkd	3d35ac7582a72911c3e5e7c9dcc5b2a7a8283ff2f9bc01c266d7d1c3c389d95f	2026-09-16 11:36:33.568	2026-08-17 18:14:48.817	\N	\N	2026-08-17 11:36:33.57
cmsxjzy370007v3z49zzlbi0z	cmsx5rcwn0000v3uwukkiufkd	7073954e2a144c0e91dd84f9d9a0e6a522dd3d8259a40d2c5a063cd3553529d6	2026-09-16 18:14:49.168	\N	\N	\N	2026-08-17 18:14:49.172
cmsxk0few0009v3z41ls8af2y	cmsx5rcwn0000v3uwukkiufkd	4d381f48523a675b266bf7d3ae301f2ade9dfac38691f6b259e6f59249540ab3	2026-09-16 18:15:11.621	2026-08-17 18:32:32.535	\N	\N	2026-08-17 18:15:11.624
cmsxkmqmd0001v33ohbrbu1hn	cmsx5rcwn0000v3uwukkiufkd	ef83f1846591b536b19a4a17db6bf1ae77b57d0edd1ca885b0f72102ef50d230	2026-09-16 18:32:32.576	2026-08-17 19:04:42.245	\N	\N	2026-08-17 18:32:32.578
cmsxls3nn000kv33olghwhlsk	cmsx5rcwn0000v3uwukkiufkd	12f95b78af829cb94e59872f457d3ab6fdd8ea09f6d8615f21959204d079b900	2026-09-16 19:04:42.359	2026-08-19 11:47:30.253	\N	\N	2026-08-17 19:04:42.365
cmt011k970003v3g0p9v16vdu	cmsx5rcwn0000v3uwukkiufkd	07a7e61d171f6661b671be8bd66a1fea7e3a3e6ef520ab390388ec8c2cb692c4	2026-09-18 11:47:30.372	\N	\N	\N	2026-08-19 11:47:30.376
cmt0121xf0005v3g07go99kqz	cmsx5rcwn0000v3uwukkiufkd	694ce34575a5385a06a8a4b751dd23a5b1612176b5bbcb6c9cb4c47da62e5d50	2026-09-18 11:47:53.282	2026-08-20 15:12:14.255	\N	\N	2026-08-19 11:47:53.283
cmt1nspbm0001v33wmkyi9j5p	cmsx5rcwn0000v3uwukkiufkd	56fc30e66f87c69786048a4d2db9790c7a0dc339ff36e31fe9bd485eaf961cfa	2026-09-19 15:12:14.377	\N	\N	\N	2026-08-20 15:12:14.38
cmt3hsn8q0001v32opfzlj98w	cmsx5rehl0005v3uwdwy4jud8	211742f39b3d6fdc54acd0f49db9b29274ca593a6afc78d9246b6747d5ff2ae1	2026-09-20 21:59:46.341	\N	\N	\N	2026-08-21 21:59:46.345
cmt3hsoku000nv32oxo1xm5z0	cmsx5rcwn0000v3uwukkiufkd	4274365608cdcf5186c8c22fbb4f195fba940da731629255e9293dece7c9de51	2026-09-20 21:59:48.075	\N	\N	\N	2026-08-21 21:59:48.078
cmt3htbs10001v3mou99u6ayn	cmsx5rcwn0000v3uwukkiufkd	8afe4767c559cd2dc9f0c19c30f5605592b3a17e7b35214bba3dae40cf53d51f	2026-09-20 22:00:18.142	\N	\N	\N	2026-08-21 22:00:18.145
cmt3htd62003hv3mo5d45fsv8	cmsx5rehl0005v3uwdwy4jud8	a1f9de900a73d91bf7dd8e49cc32c7e6f7a0ea077d86df22cacdc74d99b4b447	2026-09-20 22:00:19.944	\N	\N	\N	2026-08-21 22:00:19.946
cmt3htdvk0045v3moyd2i9jft	cmsx5rehl0005v3uwdwy4jud8	1aaa80c0a9630bf0821ea8286b3078a38db3897f35eceda34fa02bbec9d896ef	2026-09-20 22:00:20.862	\N	\N	\N	2026-08-21 22:00:20.865
cmt3htf2a0076v3mofg90obpa	cmsx5rehl0005v3uwdwy4jud8	852f3175be02d32a2512859b124b5bf417dfc16d459211e941122cd4b8f42d82	2026-09-20 22:00:22.4	\N	\N	\N	2026-08-21 22:00:22.402
cmt3htz510001v3wc09uet0no	cmsx5rcwn0000v3uwukkiufkd	25ea46dd75b938f5360d5b678b96521afc4488bb8f4a17d8f6cab163576d36cf	2026-09-20 22:00:48.406	\N	\N	\N	2026-08-21 22:00:48.421
cmt3htzmq0003v3wceq3ga2ax	cmsx5rehl0005v3uwdwy4jud8	88226f702a2e097d694b7a1007d8addbb4aa9eb229828f3ba5d50501d0cc75f4	2026-09-20 22:00:49.044	\N	\N	\N	2026-08-21 22:00:49.058
cmt3hu03p0005v3wczpe1j9ee	cmsx5rdyp0002v3uwz6wvwyci	69016495a7f2c7b519192abbfda5214930fe9493ee1c1aa82abb698a1d318698	2026-09-20 22:00:49.655	\N	\N	\N	2026-08-21 22:00:49.669
cmt3hu4z50029v3wcaqlakdbm	cmsx5rcwn0000v3uwukkiufkd	b2486292235c481b8ca8dc8c22763b609551f5879f7e45ab3d42abd6c242ba32	2026-09-20 22:00:55.971	\N	\N	\N	2026-08-21 22:00:55.985
cmt3hu62o003iv3wcmpvyzu47	cmsx5rehl0005v3uwdwy4jud8	110cbe143be03b44d05eaa994515fba05c8bde963deb6547472a040aa1353776	2026-09-20 22:00:57.394	\N	\N	\N	2026-08-21 22:00:57.409
cmt3hu72b003xv3wcy2yq6l86	cmsx5rehl0005v3uwdwy4jud8	ec15d59e40ac4135fa325eb0beef0723e573d137fee6c3883724aca4aa928b4b	2026-09-20 22:00:58.677	\N	\N	\N	2026-08-21 22:00:58.691
cmt3huaj3004rv3wcmqsbvk53	cmsx5rcwn0000v3uwukkiufkd	8c2db799c389f066bd0a2a6be3591e98653e57ee75f84170e1b00d16c6538113	2026-09-20 22:01:03.169	\N	\N	\N	2026-08-21 22:01:03.183
cmt3hub08004tv3wcfx680cuy	cmsx5rehl0005v3uwdwy4jud8	bf683f82da2506692fae904a10600928919adda7878c8039d89dadb08d4469c6	2026-09-20 22:01:03.786	\N	\N	\N	2026-08-21 22:01:03.8
cmt3hubhq004vv3wcjj2gtc4y	cmsx5rehl0005v3uwdwy4jud8	669b6f3dfcd5d174caa7a6192ad01f354caff7d4afeb811254106a436be1de70	2026-09-20 22:01:04.416	\N	\N	\N	2026-08-21 22:01:04.431
cmt3hugi1005iv3wcyk4f58su	cmsx5rehl0005v3uwdwy4jud8	fc59c17c5f6a310349977d55409cf08ee40db4a5fd6b587b8ec361859ea82d24	2026-09-20 22:01:10.907	\N	\N	\N	2026-08-21 22:01:10.921
cmt3hugz3005kv3wcgfvom0r4	cmsx5rdyp0002v3uwz6wvwyci	2167db7c24ef329c2346e6e6e44775a2917d439a07bfc09b0b8432688a279fc0	2026-09-20 22:01:11.521	\N	\N	\N	2026-08-21 22:01:11.535
cmt3hul8u005wv3wcuh9spvc6	cmsx5rehl0005v3uwdwy4jud8	30615d613d673e7750b0314dfd66fc26cb3e4c6550c8b01f848876a236430c3a	2026-09-20 22:01:17.056	\N	\N	\N	2026-08-21 22:01:17.071
cmt3hum9r006iv3wc7yq7icw9	cmsx5rcwn0000v3uwukkiufkd	5bbcca32eadad7671d4cab1fd287392c59ee0dcbafce705d3e2ef5800c7e0ef5	2026-09-20 22:01:18.385	\N	\N	\N	2026-08-21 22:01:18.399
cmt3hupgo007uv3wcczgf6jgs	cmsx5rcwn0000v3uwukkiufkd	3ef807cb79c2737b3b268a19a719dbb30303294d6a02ed7aa03a7c9c9a3e4539	2026-09-20 22:01:22.522	\N	\N	\N	2026-08-21 22:01:22.536
cmt3huqqx00b8v3wc2g7p4mz8	cmsx5rehl0005v3uwdwy4jud8	44cf2b4c92a267fb5651aa2be3b228c77f8d960a78f17f330a19ae598a45331c	2026-09-20 22:01:24.187	\N	\N	\N	2026-08-21 22:01:24.202
cmt3hurfy00bwv3wcr0ve2vuk	cmsx5rehl0005v3uwdwy4jud8	ffd30a6a409736105ef41eb687e85f0cfd63093e6b8e8f985e6e7336c973843a	2026-09-20 22:01:25.088	\N	\N	\N	2026-08-21 22:01:25.102
cmt3huskw00epv3wc6bfeda2q	cmsx5rehl0005v3uwdwy4jud8	7c507257828449280d1e63b3e7a7b3157f2e789537d8c13d4977f52a7a4424ec	2026-09-20 22:01:26.562	\N	\N	\N	2026-08-21 22:01:26.576
cmt1nufee0003v33wz5zhlwn7	cmsx5rcwn0000v3uwukkiufkd	3a425bd4567b917797f8d85c1c99dba4efd94e19d41161d50d782e99135a4171	2026-09-19 15:13:34.836	2026-08-22 00:50:31.788	\N	\N	2026-08-20 15:13:34.838
cmt3nw8ow0001v3y4cn21w2gi	cmsx5rcwn0000v3uwukkiufkd	4c6d21fcda52247ae9775b1143c9d320323202ec3cc2541a16c0000fe939ced1	2026-09-21 00:50:31.801	\N	\N	\N	2026-08-22 00:50:31.805
cmt4x30ry0001v344ycfy17p8	cmsx5rcwn0000v3uwukkiufkd	f8a04f7eb758804416d206c55b8934348152b3d1196d3b154fa5d6424a1f217e	2026-09-21 21:55:30.848	\N	\N	\N	2026-08-22 21:55:30.857
cmt4x3i0q0001v3jogfjdlq3m	cmsx5rcwn0000v3uwukkiufkd	0b43239946348ad1ef7d28eba50e378cd9bac4e08791bb829de06a853cccd2f0	2026-09-21 21:55:53.205	2026-08-23 18:44:02.264	\N	\N	2026-08-22 21:55:53.207
cmt65omwh000jv3wow1plso8t	cmsx5rcwn0000v3uwukkiufkd	823df2a428dfed136487704a9e099a532b0b52223e90bfdd7ec34d7851ccdf38	2026-09-22 18:44:02.406	\N	\N	\N	2026-08-23 18:44:02.412
cmt65p0r1000lv3wo06vmpfz8	cmsx5rcwn0000v3uwukkiufkd	a9352f02be71bd5f0cfd677d19074ee78b34a17d1dc8588930fed571ecebe063	2026-09-22 18:44:20.364	2026-08-24 10:21:31.894	\N	\N	2026-08-23 18:44:20.365
cmt7369c30009v3642alhkxnl	cmsx5rcwn0000v3uwukkiufkd	2d600d692294499d0a6dcc1815df7e3616afd65cd6dfb8989a50f57e9c7b6ee0	2026-09-23 10:21:31.96	\N	\N	\N	2026-08-24 10:21:31.967
cmt7369c9000bv364r4wy2hmc	cmsx5rcwn0000v3uwukkiufkd	91d3f1e67024840fe46420fc44ef54fcbb987eec08c147ad33290b15e0351d58	2026-09-23 10:21:31.975	\N	\N	\N	2026-08-24 10:21:31.977
cmt7369cd000dv364xdckd2ea	cmsx5rcwn0000v3uwukkiufkd	11772c296e2f75b5b34a28b76b3086f6b3a0f798e2a9a2b306d33c734e546cfe	2026-09-23 10:21:31.979	\N	\N	\N	2026-08-24 10:21:31.981
cmt7369ch000fv36402b1fzut	cmsx5rcwn0000v3uwukkiufkd	27f15178dd6a903ebbf7f75e62b3f21095c79abc99f640e29a846a01ab9af3b8	2026-09-23 10:21:31.984	\N	\N	\N	2026-08-24 10:21:31.985
cmt737bpp000jv36402qrvxam	cmsx5rcwn0000v3uwukkiufkd	2748c55301af80030ca88e1f700d4ad9ed2defba23c2d92371fad3f8a8bb61b3	2026-09-23 10:22:21.708	\N	\N	\N	2026-08-24 10:22:21.709
cmtdd5ktx0001v3xw7u2j0nxw	cmsx5rcwn0000v3uwukkiufkd	3a19c6b3ef4fd1d33469dbdab33e8b4ff1b9f671f506f473e1c89f88016238da	2026-09-27 19:47:33.401	\N	\N	\N	2026-08-28 19:47:33.403
cmtdd5lri0003v3xw4z8h7fyr	cmsx5rehl0005v3uwdwy4jud8	9e9cfa0bfb50ed246348b7e481d0c2b8e3557abcd201f850e08dfada093711d4	2026-09-27 19:47:34.635	\N	\N	\N	2026-08-28 19:47:34.638
cmtdd5mik0005v3xw2ne5xbr7	cmsx5rehl0005v3uwdwy4jud8	de3e699be7499073e7dab03c00b64c8c079996e5d725339321785b0b7e89d433	2026-09-27 19:47:35.611	\N	\N	\N	2026-08-28 19:47:35.612
cmtdd5v85000wv3xwkitrph1z	cmsx5rcwn0000v3uwukkiufkd	e1dcbb770e78a5c1f79f3e0849a045820a655347fde439356501bb321c460096	2026-09-27 19:47:46.899	\N	\N	\N	2026-08-28 19:47:46.901
cmtdd5vne000yv3xwypj3bvem	cmsx5rehl0005v3uwdwy4jud8	e034e8a0764a3d05efaf8e758f7f4882a79b4c4652baab562c2a7547e8e31332	2026-09-27 19:47:47.448	\N	\N	\N	2026-08-28 19:47:47.45
cmtdd5w6j0010v3xwevxa2b8t	cmsx5rdyp0002v3uwz6wvwyci	c3c7b03d4683741adfe6faf620cea305188710998c6259e4ff4890a5959a3599	2026-09-27 19:47:48.137	\N	\N	\N	2026-08-28 19:47:48.139
cmtdd61fv003av3xwrf6qikk9	cmsx5rcwn0000v3uwukkiufkd	ae403d8d8ba979c757f95bb4c8c0a46844b2626775baa2fe21cd0158c8654c16	2026-09-27 19:47:54.953	\N	\N	\N	2026-08-28 19:47:54.955
cmtdd65jz00cbv3xwqw83shek	cmsx5rehl0005v3uwdwy4jud8	3329f89024c5b5a9e6a71dc610d41096a668389bbcf37e0ebde04ed1cc801adc	2026-09-27 19:48:00.285	\N	\N	\N	2026-08-28 19:48:00.288
cmtdd66sd00d7v3xwnr7z5w5b	cmsx5rehl0005v3uwdwy4jud8	22bdfb009ab3b355e453303e6e5a9982b1062257ab30bbde6a4ffd86260c4c27	2026-09-27 19:48:01.882	\N	\N	\N	2026-08-28 19:48:01.885
cmtdd69bb00gwv3xw7dumtxn7	cmsx5rehl0005v3uwdwy4jud8	bc355f13edda46ef83f6a32e5082b87f5c22e212cbfc4d197c15a7a7a5a920e1	2026-09-27 19:48:05.156	\N	\N	\N	2026-08-28 19:48:05.159
cmtdd6km900gyv3xwnnttj9zr	cmsx5rcwn0000v3uwukkiufkd	d59d420e1f0258d2494af8a67094214058c316f55114540da3b80805f1e4a87d	2026-09-27 19:48:19.801	\N	\N	\N	2026-08-28 19:48:19.805
cmtdd6qt100inv3xw227rohxs	cmsx5rehl0005v3uwdwy4jud8	e63864978792a55d2d8cd70677cf7185476c3fac3212f52c439c168f6d427987	2026-09-27 19:48:27.826	\N	\N	\N	2026-08-28 19:48:27.829
cmtdd6ujk00j2v3xwrz1ogmwe	cmsx5rehl0005v3uwdwy4jud8	b3ea155cc5caf8d7b3249e93f97093d121509de385b3c7d83407fd3d6613fa77	2026-09-27 19:48:32.669	\N	\N	\N	2026-08-28 19:48:32.672
cmtdd76ox00k4v3xw8h4fxk2z	cmsx5rehl0005v3uwdwy4jud8	95b208274f00869c716f148ba7d2d3333cd2ccee4a259de11fe96ac747937e3d	2026-09-27 19:48:48.414	\N	\N	\N	2026-08-28 19:48:48.417
cmtdd79t400kqv3xwk9bv7l5u	cmsx5rcwn0000v3uwukkiufkd	44860a2cdcc24c70017210a123b25f164f1ad32d829df09f6cc9cc868440712d	2026-09-27 19:48:52.453	\N	\N	\N	2026-08-28 19:48:52.456
cmtdd7wxl00m2v3xw5n553431	cmsx5rehl0005v3uwdwy4jud8	8288db0da22818c30e08629946e0415d61c76b71ad5ef732a3b644f0faf7a20b	2026-09-27 19:49:22.386	\N	\N	\N	2026-08-28 19:49:22.401
cmtdd7xxy00m4v3xw126gi2b6	cmsx5rdyp0002v3uwz6wvwyci	f2cef2ecafa150f770dc91d363071bd0401b27e1a614b2a507d2da0373f78c99	2026-09-27 19:49:23.733	\N	\N	\N	2026-08-28 19:49:23.735
cmtdla3qv0001v3zk7bnhor32	cmsx5rcwn0000v3uwukkiufkd	18ddafde81e9ff2ddc50a6fd5d463f5896289839b60baf809b02d9ade1c828ed	2026-09-27 23:35:01.478	2026-08-28 23:52:51.054	\N	\N	2026-08-28 23:35:01.484
cmtdlx1cf0001v3msv1mwr8kr	cmsx5rcwn0000v3uwukkiufkd	aaea6c47f2b92271aeb2e80a3daaa8ff3e31791a588b611c225198e946e9571d	2026-09-27 23:52:51.464	\N	\N	\N	2026-08-28 23:52:51.467
cmtdlxmyu0003v3msfg8a3zyt	cmsx5rcwn0000v3uwukkiufkd	b79b852e45224eac090035369b178b4d304a12b15ae6428c7e797090bf41c7be	2026-09-27 23:53:19.493	2026-08-29 00:41:37.574	\N	\N	2026-08-28 23:53:19.494
cmtdnnrg90001v3igql1uizrg	cmsx5rcwn0000v3uwukkiufkd	d5bf11f939a6f6f3c268a00331fc2cd3cb90c0497173b4996177c45d3bee9217	2026-09-28 00:41:37.968	\N	\N	\N	2026-08-29 00:41:37.972
cmtdno8va0003v3iga66atwwd	cmsx5rcwn0000v3uwukkiufkd	7d45ac2bb0a600350f9ad4723257d4864b38c9ec02fd94b5f8f09c4b88baa659	2026-09-28 00:42:00.547	\N	\N	\N	2026-08-29 00:42:00.55
cmtel4xuv0001v32szj5cols8	cmsx5rcwn0000v3uwukkiufkd	70c23663d1756b05f4e6c2d33ad22690564a3381daa87edb9ceaacf128953cc2	2026-09-28 16:18:46.752	\N	\N	\N	2026-08-29 16:18:46.755
cmtel50c30092v32sy0v8rn1y	cmsx5rehl0005v3uwdwy4jud8	2c7b13842b86e4035c9a901c8095898d8960922c69bf3e1d00f22399ffe533a8	2026-09-28 16:18:49.969	\N	\N	\N	2026-08-29 16:18:49.971
cmtel5114009yv32sn5suxmme	cmsx5rehl0005v3uwdwy4jud8	cc5c7a181dbaa194d5d4651fb820c94b92668edc630b5a2fd2320ec312f11c65	2026-09-28 16:18:50.87	\N	\N	\N	2026-08-29 16:18:50.872
cmtel529r00dnv32srqclut6r	cmsx5rehl0005v3uwdwy4jud8	0bf2825003ecfd974a0fb9baef089d44c053ab9354af6b13864819e0009f2f75	2026-09-28 16:18:52.478	\N	\N	\N	2026-08-29 16:18:52.48
cmtel55qo00dpv32sj0eu0xy6	cmsx5rehl0005v3uwdwy4jud8	ed5a7f485709a72db8ff3f1fc87eb915a01088488a41bff5eac925ae8dacfd79	2026-09-28 16:18:56.974	\N	\N	\N	2026-08-29 16:18:56.976
cmtel56sy00ebv32sdf5zs7op	cmsx5rcwn0000v3uwukkiufkd	31b4b3232fd6d6ed6ca95b39b783e5b2d39d1f6dfd83f204b6b7bf769d11652b	2026-09-28 16:18:58.352	\N	\N	\N	2026-08-29 16:18:58.354
cmtel5adp00fnv32so5gccxk4	cmsx5rehl0005v3uwdwy4jud8	5a0685baab7b5c78506f9b67f863b7a557e0102a3e61e52d8b7d2a3c5a1ea4a0	2026-09-28 16:19:02.987	\N	\N	\N	2026-08-29 16:19:02.989
cmtel5aqu00fpv32svsfuzrhj	cmsx5rdyp0002v3uwz6wvwyci	54d21c19ef45c010c1dfb6fb97645821190c328db7e9cb3521741dd7c30ed88f	2026-09-28 16:19:03.46	\N	\N	\N	2026-08-29 16:19:03.462
cmtel5d0x00g1v32s5r5r0b4v	cmsx5rcwn0000v3uwukkiufkd	a2198d13aa13717945667fbd5c12a7b5504ae7498d9e0d24c5d322f32344162e	2026-09-28 16:19:06.415	\N	\N	\N	2026-08-29 16:19:06.417
cmtel5dhf00g3v32szelpuwie	cmsx5rehl0005v3uwdwy4jud8	e14a72b60d822fbe51d99d622a9fca4c0ea06496678d6389ad61665ad9a391d7	2026-09-28 16:19:07.009	\N	\N	\N	2026-08-29 16:19:07.012
cmtel5dxz00g5v32s406mh9rl	cmsx5rehl0005v3uwdwy4jud8	b99d7806b8ff0e40ae4077f73b4357e5a2f8b5c525544c75e7a2ecbe6eca910d	2026-09-28 16:19:07.605	\N	\N	\N	2026-08-29 16:19:07.607
cmtel5hv200gwv32sr57fd9j3	cmsx5rcwn0000v3uwukkiufkd	756e804423341a288779fa05c76ff0a7a55aa2a938e12c69f72d8e58442e2d54	2026-09-28 16:19:12.684	\N	\N	\N	2026-08-29 16:19:12.686
cmtel5iq800ilv32setth3dpi	cmsx5rehl0005v3uwdwy4jud8	caa7388845b19203474f4c92dbee2727d6101b192a79d900c37d4bbb8b66ab53	2026-09-28 16:19:13.807	\N	\N	\N	2026-08-29 16:19:13.809
cmtel5jos00j0v32sxi0xdsq9	cmsx5rehl0005v3uwdwy4jud8	87f7ab44207b943d373ead1a630aa024a9221a7c9c26e859e38deeb3d0730773	2026-09-28 16:19:15.05	\N	\N	\N	2026-08-29 16:19:15.052
cmtel5mcq00k2v32sczz375tu	cmsx5rcwn0000v3uwukkiufkd	9bdd99bb84b74954ac47d12d4efa234bc4da912bdf045f508d82f7a9938fcad9	2026-09-28 16:19:18.504	\N	\N	\N	2026-08-29 16:19:18.506
cmtel5mqk00k4v32sepheswwq	cmsx5rehl0005v3uwdwy4jud8	c15f17bc95ead2b071d9a54c1102934ce122a2f14ed618fb6bbea9ed79dd3795	2026-09-28 16:19:19.002	\N	\N	\N	2026-08-29 16:19:19.004
cmtel5n4a00k6v32sjcfjgei2	cmsx5rdyp0002v3uwz6wvwyci	ff26c354497eb1deba29ceecff9f419d96dae61130c5af1d8d91695827b81259	2026-09-28 16:19:19.495	\N	\N	\N	2026-08-29 16:19:19.498
cmtel6nru0001v3mcbb1sdhrm	cmsx5rcwn0000v3uwukkiufkd	f87f15e3507513f007ee4f51b82b526872e8fb6623b92294865317655b93d4fa	2026-09-28 16:20:06.991	\N	\N	\N	2026-08-29 16:20:06.998
cmtel6osw001qv3mc545mfsbg	cmsx5rehl0005v3uwdwy4jud8	b11e3eedb50a90ffb75e4f48158c3a0f9341aa039f8791c686851fd9b8a71de5	2026-09-28 16:20:08.33	\N	\N	\N	2026-08-29 16:20:08.336
cmtel6pua0025v3mcvhcsdlxm	cmsx5rehl0005v3uwdwy4jud8	b09cfed0edb684da99fd73ed6cf9915bc24ffcaa0cdb545425920cc3802c2e1d	2026-09-28 16:20:09.676	\N	\N	\N	2026-08-29 16:20:09.682
cmtel6t6r0037v3mc4gtxzlz8	cmsx5rcwn0000v3uwukkiufkd	ec4f9b6fdb402b377c625204558ab4b88286526ed00ab632d5541b022ce182c5	2026-09-28 16:20:14.013	\N	\N	\N	2026-08-29 16:20:14.019
cmtel6vjw00c8v3mcwdyao83n	cmsx5rehl0005v3uwdwy4jud8	81740296b9fa3886d2b2c7e21e9c86cbd12ed69ebb6c1eb4144802376401a36c	2026-09-28 16:20:17.078	\N	\N	\N	2026-08-29 16:20:17.084
cmtel6w6v00d4v3mcsf1t7y5b	cmsx5rehl0005v3uwdwy4jud8	31f883fdc8275528093225cdedf3f3dcb5d9af403416e21a47ebe89ec978cb29	2026-09-28 16:20:17.904	\N	\N	\N	2026-08-29 16:20:17.911
cmtel6xj600gtv3mcsqfgr1vh	cmsx5rehl0005v3uwdwy4jud8	9c1398db6838e1a9e5ff8c187bdf5ea3d8b20597248b9431c8a0bd9b2a82f334	2026-09-28 16:20:19.644	\N	\N	\N	2026-08-29 16:20:19.651
cmtel6zxu00gvv3mce4bux4qq	cmsx5rehl0005v3uwdwy4jud8	40ad30f99336fa02afc841145b0dbef124465695671fe86cfe5e936972137cef	2026-09-28 16:20:22.764	\N	\N	\N	2026-08-29 16:20:22.77
cmtel713400hhv3mczmcbye5k	cmsx5rcwn0000v3uwukkiufkd	a9b25c9ac93380b369831df182dbe45fea4c8c48bf65334b77256e9dc8edbdd3	2026-09-28 16:20:24.249	\N	\N	\N	2026-08-29 16:20:24.256
cmtel74f000itv3mc47ykyopp	cmsx5rcwn0000v3uwukkiufkd	a8bd77c3171bba418ed60ac73024c856663e981a0773e6a0afa9de305cadae77	2026-09-28 16:20:28.566	\N	\N	\N	2026-08-29 16:20:28.573
cmtel74sb00ivv3mcg9hyg9p6	cmsx5rehl0005v3uwdwy4jud8	ab4dfed8c07fb06a7953cc6dbed1f4b532eb81ecc43b0a19de3bf7e01d6974f7	2026-09-28 16:20:29.045	\N	\N	\N	2026-08-29 16:20:29.051
cmtel756700ixv3mci2wkyzlj	cmsx5rehl0005v3uwdwy4jud8	e12c3145116f70a299ca30c1742e3d74e1ff53710e22db668d59d1cea08e39c0	2026-09-28 16:20:29.545	\N	\N	\N	2026-08-29 16:20:29.551
cmtel79ju00jov3mcc8ij1il5	cmsx5rcwn0000v3uwukkiufkd	c0f6219844a39ee73229c6fb508bf8b723bc16a9dd7edce5faeaa2354430d3a6	2026-09-28 16:20:35.22	\N	\N	\N	2026-08-29 16:20:35.227
cmtel79yq00jqv3mcz8t226yx	cmsx5rehl0005v3uwdwy4jud8	7df91154592f4952a641d3f88de21d160e5259cc5ebcc917f584e057bc7f7df0	2026-09-28 16:20:35.756	\N	\N	\N	2026-08-29 16:20:35.763
cmtel7agz00jsv3mcmhl25uqj	cmsx5rdyp0002v3uwz6wvwyci	a8f8d98392c6e0a9a3590c861206ecbf4c20f71039eca2bdd0ccdfa3e57d1b73	2026-09-28 16:20:36.413	\N	\N	\N	2026-08-29 16:20:36.42
cmtel7esw00m2v3mcwjnogtly	cmsx5rehl0005v3uwdwy4jud8	28d02afb9ad6950893a80384400fa11260a1c1949548c93bced7593cdf409914	2026-09-28 16:20:42.026	\N	\N	\N	2026-08-29 16:20:42.033
cmtel7f7100m4v3mcg0tfkukf	cmsx5rdyp0002v3uwz6wvwyci	21b72ce8ebfa72a6ddc17e4c80ee5a727c75c778c9d374bc5afde5303f35083d	2026-09-28 16:20:42.534	\N	\N	\N	2026-08-29 16:20:42.541
cmtel8uly0001v3305gnhbbgh	cmsx5rcwn0000v3uwukkiufkd	2a1ff58a0e15523380a9893807e9331ba5bfa44ad7064028d3ecdae2c4639757	2026-09-28 16:21:49.162	\N	\N	\N	2026-08-29 16:21:49.173
cmtel8vl7001qv3306yj168oc	cmsx5rehl0005v3uwdwy4jud8	30217aa6c74a95f0625e39e7221248f8739aaae3dd9d50d71c0a2fe8f174a7e7	2026-09-28 16:21:50.433	\N	\N	\N	2026-08-29 16:21:50.443
cmtel8wm90025v3303tq1do3l	cmsx5rehl0005v3uwdwy4jud8	2afdfc2d7e0c8e68e5f60da66bf07b3bb4a907c6bcfafa90fcb073572fbae66b	2026-09-28 16:21:51.767	\N	\N	\N	2026-08-29 16:21:51.778
cmtel8zg10035v3305sy963rn	cmsx5rcwn0000v3uwukkiufkd	e04fe0b3512b4cfe8a67bda69b6720a937e05e3f05375760f57af0144d6c903e	2026-09-28 16:21:55.431	\N	\N	\N	2026-08-29 16:21:55.441
cmtel91sa00c6v330vpjggli2	cmsx5rehl0005v3uwdwy4jud8	e60980a5e70ed62307edc777f7b231668dc803b51dacc36de2663fd0892bc882	2026-09-28 16:21:58.464	\N	\N	\N	2026-08-29 16:21:58.474
cmtel92do00d2v330ovoxxpox	cmsx5rehl0005v3uwdwy4jud8	9cc0be745a0996474c3fba582bc6215f8ec451b76b8a7f6150d036ec3cadb434	2026-09-28 16:21:59.234	\N	\N	\N	2026-08-29 16:21:59.245
cmtel93j500gnv330njk4ux20	cmsx5rehl0005v3uwdwy4jud8	a24d8d86f6fbc1ca4d2ab74b4db052aed8a0521e4bceea0abc643e6eee13baf9	2026-09-28 16:22:00.727	\N	\N	\N	2026-08-29 16:22:00.737
cmtel96f100gtv330svfchf6d	cmsx5rcwn0000v3uwukkiufkd	d6e9325df4f34f46371d61d76da08d1ebf326957427e12415f375a03c1903429	2026-09-28 16:22:04.467	\N	\N	\N	2026-08-29 16:22:04.477
cmtel970300gvv330xtvjrj33	cmsx5rehl0005v3uwdwy4jud8	11a929ef258c7abae33add65afd2aca6de71d6e7b68b62e2d52b418cd7b4dfc4	2026-09-28 16:22:05.224	\N	\N	\N	2026-08-29 16:22:05.235
cmtel97io00gxv3303nenmi3y	cmsx5rdyp0002v3uwz6wvwyci	4f10cc2560d4726832e37d878869d00b24313e62cda639d129092ae21bdadb45	2026-09-28 16:22:05.894	\N	\N	\N	2026-08-29 16:22:05.905
cmtel9c4m00j7v330iy33u10g	cmsx5rcwn0000v3uwukkiufkd	1d4cc563bcbd6502fb54aadbac268bfd1a6ed1c17aed917647ea223e493bd87d	2026-09-28 16:22:11.868	\N	\N	\N	2026-08-29 16:22:11.878
cmtel9civ00j9v330j1jerfzz	cmsx5rehl0005v3uwdwy4jud8	876cb30e9eb097ba75c0e32fead0078f494cbca57d1ef2f056b81104b34c04a3	2026-09-28 16:22:12.381	\N	\N	\N	2026-08-29 16:22:12.391
cmtel9d0w00jbv330t160gxo4	cmsx5rehl0005v3uwdwy4jud8	24d9d0f566f65713a16b17102af994122aee02bf8e4a85bb00dca34c9858d70c	2026-09-28 16:22:13.03	\N	\N	\N	2026-08-29 16:22:13.04
cmtel9h8j00k2v3304uq4qo47	cmsx5rehl0005v3uwdwy4jud8	852f7d25945514fbb10e6496a3a80056aca22cc176b4fcd246be47d2d1bb471e	2026-09-28 16:22:18.489	\N	\N	\N	2026-08-29 16:22:18.5
cmtel9iee00kov330pgnqdpop	cmsx5rcwn0000v3uwukkiufkd	a14fdda7bb1732e792927572f1f3d6f75267eb797c15d2835fe65a0d71be733b	2026-09-28 16:22:19.996	\N	\N	\N	2026-08-29 16:22:20.007
cmtel9ljj00m0v3306v482xoh	cmsx5rehl0005v3uwdwy4jud8	a76e030083de3ec1d20dc958ab421fae904d713dffbd81f4307cd89a5bbceeaa	2026-09-28 16:22:24.069	\N	\N	\N	2026-08-29 16:22:24.079
cmtel9lxf00m2v330wlzrn8zu	cmsx5rdyp0002v3uwz6wvwyci	014324e970c3a3dc540f58ebb1beaaaff6ffbdac38959ea22fe625deeee222be	2026-09-28 16:22:24.569	\N	\N	\N	2026-08-29 16:22:24.579
\.


--
-- Data for Name: RolePermission; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."RolePermission" (id, role, "permissionId", "createdAt") FROM stdin;
cmtdcv9co000pv3gcdcjh2ofr	CUSTOMER	cmtdcv9c0000jv3gc78ejsd5k	2026-08-28 19:39:31.993
cmtdcv9d5000rv3gcec523i6a	TAILOR	cmtdcv9c0000jv3gc78ejsd5k	2026-08-28 19:39:32.01
cmtdcv9d8000tv3gc5whobu95	TAILOR	cmtdcv9aw0005v3gc3mqzqkyf	2026-08-28 19:39:32.012
cmtdcv9da000vv3gca7tr8e8p	TAILOR	cmtdcv9az0006v3gcsvvd1n1j	2026-08-28 19:39:32.015
cmtdcv9dc000xv3gc4d6hb4q8	TAILOR	cmtdcv9b20007v3gcowra5msn	2026-08-28 19:39:32.017
cmtdcv9df000zv3gc8c3ufr6z	STAFF	cmtdcv9c0000jv3gc78ejsd5k	2026-08-28 19:39:32.019
cmtdcv9di0011v3gchxfm38ik	STAFF	cmtdcv98r0000v3gc7tpp6s13	2026-08-28 19:39:32.022
cmtdcv9dk0013v3gcznjpeleu	STAFF	cmtdcv9ai0001v3gcyejbvjph	2026-08-28 19:39:32.025
cmtdcv9dn0015v3gcwgx0rbq7	STAFF	cmtdcv9al0002v3gccdvt8f90	2026-08-28 19:39:32.027
cmtdcv9dr0017v3gcpk9mue8w	STAFF	cmtdcv9ap0003v3gcfssf3puk	2026-08-28 19:39:32.031
cmtdcv9dt0019v3gcgqwqr1yg	STAFF	cmtdcv9at0004v3gcl37uspqk	2026-08-28 19:39:32.033
cmtdcv9dv001bv3gcoqrbanr0	STAFF	cmtdcv9aw0005v3gc3mqzqkyf	2026-08-28 19:39:32.035
cmtdcv9dx001dv3gc0gcsfk19	STAFF	cmtdcv9az0006v3gcsvvd1n1j	2026-08-28 19:39:32.038
cmtdcv9e0001fv3gc50gmlspb	STAFF	cmtdcv9b50008v3gcsoz54qwd	2026-08-28 19:39:32.04
cmtdcv9e2001hv3gc48vuibu6	STAFF	cmtdcv9b80009v3gcleyrl7dq	2026-08-28 19:39:32.043
cmtdcv9e5001jv3gcg8q8307h	STAFF	cmtdcv9bb000av3gch3w8cpz3	2026-08-28 19:39:32.045
cmtdcv9e7001lv3gcp1743iin	STAFF	cmtdcv9be000bv3gc3bsznqng	2026-08-28 19:39:32.047
cmtdcv9e9001nv3gcvpbw2dvs	STAFF	cmtdcv9bh000cv3gcmq2sy14n	2026-08-28 19:39:32.049
cmtdcv9eb001pv3gc48o0faj2	STAFF	cmtdcv9bj000dv3gciael0qnp	2026-08-28 19:39:32.052
cmtdcv9ee001rv3gcwtj3tkqz	STAFF	cmtdcv9bp000fv3gcrft0ezm1	2026-08-28 19:39:32.054
cmtdcv9eh001tv3gciitn84fb	STAFF	cmtdcv9bs000gv3gclojnfxs8	2026-08-28 19:39:32.057
cmtdcv9ej001vv3gchoes7t9y	STAFF	cmtdcv9bv000hv3gcfelqf3dt	2026-08-28 19:39:32.06
cmtdcv9em001xv3gc3mfws8wm	STAFF	cmtdcv9by000iv3gcubo6p58i	2026-08-28 19:39:32.062
cmtdcv9eo001zv3gcz7x7upbq	ADMIN	cmtdcv9c0000jv3gc78ejsd5k	2026-08-28 19:39:32.064
cmtdcv9eq0021v3gcce49qcbw	ADMIN	cmtdcv98r0000v3gc7tpp6s13	2026-08-28 19:39:32.067
cmtdcv9es0023v3gcxs6b17e3	ADMIN	cmtdcv9ai0001v3gcyejbvjph	2026-08-28 19:39:32.069
cmtdcv9ev0025v3gcx14rjo4a	ADMIN	cmtdcv9al0002v3gccdvt8f90	2026-08-28 19:39:32.071
cmtdcv9ex0027v3gcynurfqhj	ADMIN	cmtdcv9ap0003v3gcfssf3puk	2026-08-28 19:39:32.074
cmtdcv9f00029v3gc0j1y89i0	ADMIN	cmtdcv9at0004v3gcl37uspqk	2026-08-28 19:39:32.077
cmtdcv9f3002bv3gcy4i8a52w	ADMIN	cmtdcv9aw0005v3gc3mqzqkyf	2026-08-28 19:39:32.079
cmtdcv9f5002dv3gcdk5czb5p	ADMIN	cmtdcv9az0006v3gcsvvd1n1j	2026-08-28 19:39:32.081
cmtdcv9f7002fv3gczftmlvnq	ADMIN	cmtdcv9b50008v3gcsoz54qwd	2026-08-28 19:39:32.083
cmtdcv9fa002hv3gc9nastojv	ADMIN	cmtdcv9b80009v3gcleyrl7dq	2026-08-28 19:39:32.086
cmtdcv9fc002jv3gcwyqaiab8	ADMIN	cmtdcv9bb000av3gch3w8cpz3	2026-08-28 19:39:32.088
cmtdcv9ff002lv3gc9bp0r5nd	ADMIN	cmtdcv9be000bv3gc3bsznqng	2026-08-28 19:39:32.091
cmtdcv9fh002nv3gc8f535sf7	ADMIN	cmtdcv9bh000cv3gcmq2sy14n	2026-08-28 19:39:32.094
cmtdcv9fk002pv3gclwifrtqt	ADMIN	cmtdcv9bj000dv3gciael0qnp	2026-08-28 19:39:32.096
cmtdcv9fm002rv3gchp134rsh	ADMIN	cmtdcv9bm000ev3gcra293v7p	2026-08-28 19:39:32.098
cmtdcv9fo002tv3gcbjq5wafb	ADMIN	cmtdcv9bp000fv3gcrft0ezm1	2026-08-28 19:39:32.1
cmtdcv9fq002vv3gchfm156ju	ADMIN	cmtdcv9bs000gv3gclojnfxs8	2026-08-28 19:39:32.102
cmtdcv9fs002xv3gc80wojppj	ADMIN	cmtdcv9bv000hv3gcfelqf3dt	2026-08-28 19:39:32.104
cmtdcv9fv002zv3gcc81ah5tm	ADMIN	cmtdcv9by000iv3gcubo6p58i	2026-08-28 19:39:32.107
cmtdcv9fx0031v3gc9euy075q	ADMIN	cmtdcv9c2000kv3gcj2wrsu1b	2026-08-28 19:39:32.11
cmtdcv9fz0033v3gczhqqoqvv	ADMIN	cmtdcv9c5000lv3gc98oclo5k	2026-08-28 19:39:32.112
cmtdcv9g20035v3gcufwz0q42	ADMIN	cmtdcv9c8000mv3gcqejwhst1	2026-08-28 19:39:32.114
cmtdcv9g30037v3gcsohfw4w6	ADMIN	cmtdcv9cb000nv3gc5lvexutd	2026-08-28 19:39:32.116
\.


--
-- Data for Name: Segment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Segment" (id, name, description, filter, "createdById", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Setting; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Setting" (key, value, description, "updatedAt") FROM stdin;
store	{"nameEn": "Yaseen", "nameUr": "یٰسین", "whatsapp": "+923001234567", "supportEmail": "support@yaseen.pk", "supportPhone": "+923001234567"}	\N	2026-08-17 11:27:34.396
shipping.zones	[{"fee": 15000, "key": "karachi", "cities": ["karachi"], "etaDays": [1, 2], "labelEn": "Karachi", "labelUr": "کراچی", "freeAbove": 300000}, {"fee": 20000, "key": "punjab", "cities": ["lahore", "islamabad", "rawalpindi", "faisalabad", "multan", "gujranwala"], "etaDays": [2, 4], "labelEn": "Punjab & Islamabad", "labelUr": "پنجاب و اسلام آباد", "freeAbove": 400000}, {"fee": 25000, "key": "rest_of_pakistan", "cities": [], "etaDays": [3, 6], "labelEn": "Rest of Pakistan", "labelUr": "باقی پاکستان", "freeAbove": 500000}]	\N	2026-08-17 11:27:34.396
checkout.cod_fee	10000	\N	2026-08-17 11:27:34.396
checkout.cod_enabled	true	\N	2026-08-17 11:27:34.396
checkout.min_order_value	50000	\N	2026-08-17 11:27:34.396
stitching.lead_days	7	\N	2026-08-17 11:27:34.396
payments.bank_accounts	[{"bank": "Meezan Bank", "iban": "PK00MEZN0000000000000000", "title": "Yaseen Clothing", "accountNumber": "00000000000000"}]	\N	2026-08-17 11:27:34.396
catalog.low_stock_threshold	3	\N	2026-08-17 11:27:34.396
analytics.monthly_revenue_target	100000000	\N	2026-08-22 22:33:17.987
purchasing.over_receipt_tolerance	0	\N	2026-08-28 19:47:29.844
purchasing.auto_draft_reorder	true	\N	2026-08-28 19:47:29.844
inventory.slow_mover_days	60	\N	2026-08-28 19:47:29.844
inventory.dead_stock_days	180	\N	2026-08-28 19:47:29.844
\.


--
-- Data for Name: Shipment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Shipment" (id, "orderId", courier, "trackingNumber", "trackingUrl", status, cost, "dispatchedAt", "deliveredAt", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: StitchingJob; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."StitchingJob" (id, number, "orderItemId", "stitchingOrderId", "garmentTypeId", "measurementSnapshot", "optionsSnapshot", instructions, stage, "assignedTailorId", priority, "dueAt", "startedAt", "completedAt", "createdAt", "updatedAt") FROM stdin;
cmsxjvli6000mv3ugt9uc330a	JOB-2026-0001	cmsxjvk0n000ev3ugrzxurlzb	\N	cmsx5rek50007v3uwzg0vl4hk	{"label": "Self", "values": {"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15, "sleeve_length": 22, "sleeve_opening": 10}, "garmentTypeKey": "kameez"}	[{"key": "cuffed", "labelEn": "Cuffed", "labelUr": "کف والی", "groupKey": "sleeve_style", "priceDelta": 20000, "groupLabelEn": "Sleeve style", "groupLabelUr": "آستین"}, {"key": "lining", "labelEn": "Full lining", "labelUr": "مکمل استر", "groupKey": "kameez_finish", "priceDelta": 40000, "groupLabelEn": "Finishing", "groupLabelUr": "فنشنگ"}, {"key": "boat", "labelEn": "Boat", "labelUr": "بوٹ", "groupKey": "neckline", "priceDelta": 15000, "groupLabelEn": "Neckline", "groupLabelUr": "گلا"}]	\N	RECEIVED	\N	0	2026-08-25 18:11:26.224	\N	\N	2026-08-17 18:11:26.236	2026-08-17 18:11:26.236
cmsx5rfez007tv3uwr7eypmuf	JOB-DEMO-0001	\N	cmsx5rfe9007rv3uwd32sl9is	cmsx5rek50007v3uwzg0vl4hk	{"hips": 40, "chest": 38, "waist": 34, "length": 42, "shoulder": 15}	\N	\N	RECEIVED	\N	0	2026-08-26 11:36:17.071	\N	\N	2026-08-17 11:36:17.099	2026-08-28 23:11:56.469
cmsx5rfh0007yv3uwswkjcybp	JOB-DEMO-0002	\N	cmsx5rfgw007wv3uwuuwxt7u4	cmsx5rek50007v3uwzg0vl4hk	{"hips": 42, "chest": 40, "waist": 36, "length": 44, "shoulder": 16}	\N	Slightly loose through the waist.	CUTTING	cmsx5rdyp0002v3uwz6wvwyci	0	2026-08-22 11:36:17.071	2026-08-15 11:36:17.071	\N	2026-08-17 11:36:17.173	2026-08-28 23:11:56.486
cmsx5rfhr0084v3uwh8dg6q8s	JOB-DEMO-0003	\N	cmsx5rfgw007wv3uwuuwxt7u4	cmsx5rem6000sv3uw27ole3ls	{"hips": 44, "waist": 36, "bottom": 14, "length": 40}	\N	\N	STITCHING	cmsx5rdyp0002v3uwz6wvwyci	0	2026-08-22 11:36:17.071	2026-08-15 11:36:17.071	\N	2026-08-17 11:36:17.199	2026-08-28 23:11:56.496
cmsx5rfip008dv3uw9d5hdvb4	JOB-DEMO-0004	\N	cmsx5rfik008bv3uw0kp52dy0	cmsx5rent001gv3uwu7e5gsav	{"chest": 42, "length": 41, "shoulder": 18, "sleeve_length": 24}	\N	\N	QC	cmsx5rdyp0002v3uwz6wvwyci	0	2026-08-15 11:36:17.071	2026-08-15 11:36:17.071	\N	2026-08-17 11:36:17.233	2026-08-28 23:11:56.51
cmsx5rfjj008nv3uwtuq0aq2n	JOB-DEMO-0005	\N	cmsx5rfik008bv3uw0kp52dy0	cmsx5rent001gv3uwu7e5gsav	{"chest": 42, "length": 41, "shoulder": 18, "sleeve_length": 24}	\N	\N	READY	cmsx5rdyp0002v3uwz6wvwyci	0	2026-08-18 11:36:17.071	2026-08-15 11:36:17.071	2026-08-16 11:36:17.071	2026-08-17 11:36:17.263	2026-08-28 23:11:56.522
\.


--
-- Data for Name: StitchingJobEvent; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."StitchingJobEvent" (id, "jobId", "fromStage", "toStage", note, "photoUrl", "actorId", "createdAt") FROM stdin;
cmsx5rfgc007vv3uwwj3cez66	cmsx5rfez007tv3uwr7eypmuf	\N	RECEIVED	Booking STO-DEMO-0001	\N	\N	2026-08-16 11:36:17.071
cmsx5rfh90080v3uw2vcfu1sx	cmsx5rfh0007yv3uwswkjcybp	\N	RECEIVED	Booking STO-DEMO-0002	\N	\N	2026-08-15 11:36:17.071
cmsx5rfhg0082v3uwbxf46d0l	cmsx5rfh0007yv3uwswkjcybp	RECEIVED	CUTTING	\N	\N	\N	2026-08-16 11:36:17.071
cmsx5rfi10086v3uwdpepzcw1	cmsx5rfhr0084v3uwh8dg6q8s	\N	RECEIVED	Booking STO-DEMO-0002	\N	\N	2026-08-14 11:36:17.071
cmsx5rfi70088v3uwpr2nerf2	cmsx5rfhr0084v3uwh8dg6q8s	RECEIVED	CUTTING	\N	\N	\N	2026-08-15 11:36:17.071
cmsx5rfih008av3uwnluug0z2	cmsx5rfhr0084v3uwh8dg6q8s	CUTTING	STITCHING	\N	\N	\N	2026-08-16 11:36:17.071
cmsx5rfix008fv3uwa78pjynu	cmsx5rfip008dv3uw9d5hdvb4	\N	RECEIVED	Booking STO-DEMO-0003	\N	\N	2026-08-13 11:36:17.071
cmsx5rfj2008hv3uwdt3mcb5k	cmsx5rfip008dv3uw9d5hdvb4	RECEIVED	CUTTING	\N	\N	\N	2026-08-14 11:36:17.071
cmsx5rfj9008jv3uw4qbln8dd	cmsx5rfip008dv3uw9d5hdvb4	CUTTING	STITCHING	\N	\N	\N	2026-08-15 11:36:17.071
cmsx5rfjf008lv3uw4wpkdrvx	cmsx5rfip008dv3uw9d5hdvb4	STITCHING	QC	\N	\N	\N	2026-08-16 11:36:17.071
cmsx5rfjq008pv3uwr4k9qdj2	cmsx5rfjj008nv3uwtuq0aq2n	\N	RECEIVED	Booking STO-DEMO-0003	\N	\N	2026-08-12 11:36:17.071
cmsx5rfjw008rv3uw9dv1tqpu	cmsx5rfjj008nv3uwtuq0aq2n	RECEIVED	CUTTING	\N	\N	\N	2026-08-13 11:36:17.071
cmsx5rfk3008tv3uwp1cik6y1	cmsx5rfjj008nv3uwtuq0aq2n	CUTTING	STITCHING	\N	\N	\N	2026-08-14 11:36:17.071
cmsx5rfk9008vv3uwjio02sxe	cmsx5rfjj008nv3uwtuq0aq2n	STITCHING	QC	\N	\N	\N	2026-08-15 11:36:17.071
cmsx5rfkg008xv3uweii8dmds	cmsx5rfjj008nv3uwtuq0aq2n	QC	READY	\N	\N	\N	2026-08-16 11:36:17.071
cmsxjvli9000nv3ugjbh1si8a	cmsxjvli6000mv3ugt9uc330a	\N	RECEIVED	From order YSN-2026-0001	\N	\N	2026-08-17 18:11:26.236
\.


--
-- Data for Name: StitchingOption; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."StitchingOption" (id, "groupId", key, "labelEn", "labelUr", "priceDelta", "imageUrl", "order", "isActive") FROM stdin;
cmtdcvbph00dkv3gcsmuyth8x	cmtdcvbpe00div3gc2fptyjk3	plain	Plain	سادہ	0	\N	0	t
cmsx5rerp0030v3uwy1ibtz53	cmsx5rer8002sv3uwmtuaqcl0	sleeveless	Sleeveless	بغیر آستین	-15000	\N	3	t
cmtdcvbqn00ecv3gcpstn9j0g	cmsx5rer8002sv3uwmtuaqcl0	puffed_lantern	Puffed lantern	پفڈ لالٹین آستین	30000	\N	4	t
cmtdcvbqq00eev3gc21dcyf4q	cmsx5rer8002sv3uwmtuaqcl0	organza_extension	Custom organza extension trim	آرگنزا ایکسٹینشن ٹرم	95000	\N	5	t
cmtdcvbqw00eiv3gc5dpvkdw5	cmtdcvbqt00egv3gctwq0nuax	full	Full	پوری	0	\N	0	t
cmsx5resu003iv3uwlkegtsxg	cmsx5resb003av3uwfqrqj0f1	palazzo	Palazzo	پلازو	25000	\N	3	t
cmsx5ret6003mv3uwdttdvh2p	cmsx5resy003kv3uwv7zmvv2w	classic	Classic	کلاسک	0	\N	0	t
cmsx5reta003ov3uwbdudcfnc	cmsx5resy003kv3uwv7zmvv2w	tulip	Tulip	ٹیولپ	30000	\N	1	t
cmsx5retg003qv3uw5jf8osc1	cmsx5resy003kv3uwv7zmvv2w	dhoti	Dhoti	دھوتی	35000	\N	3	t
cmsx5rerz0034v3uw3jd9jb6j	cmsx5rert0032v3uwmz5t53td	lining	Full lining	مکمل استر	40000	\N	0	f
cmsx5reqy002ov3uwpja67sg9	cmsx5req7002iv3uwwknk0g16	boat	Boat	بوٹ	15000	\N	2	t
cmsx5rer3002qv3uw4ie308og	cmsx5req7002iv3uwwknk0g16	square	Square	اسکوائر	15000	\N	3	t
cmtdcvbp400dev3gcide62i0j	cmsx5req7002iv3uwwknk0g16	sherwani_collar	Structured Sherwani collar	شیروانی کالر	30000	\N	4	t
cmsx5requ002mv3uwyneoredy	cmsx5req7002iv3uwwknk0g16	v_neck	V-neck	وی گلا	0	\N	1	t
cmtdcvbpa00dgv3gc58z71zza	cmsx5req7002iv3uwwknk0g16	sweetheart	Sweetheart	سویٹ ہارٹ گلا	20000	\N	5	t
cmtdcvbpk00dmv3gcwaxby1xs	cmtdcvbpe00div3gc2fptyjk3	piping	Piping	پائپنگ	15000	\N	1	t
cmtdcvbpn00dov3gcy3id12wu	cmtdcvbpe00div3gc2fptyjk3	lace	Lace	لیس	30000	\N	2	t
cmtdcvbpq00dqv3gc8znhbjq9	cmtdcvbpe00div3gc2fptyjk3	embroidered	Embroidered patti	کڑھائی والی پٹی	70000	\N	3	t
cmtdcvbpx00duv3gcz2is4za6	cmtdcvbpu00dsv3gctpxpc469	band	Band collar	بین کالر	0	\N	0	t
cmtdcvbq000dwv3gcuw4s0xsu	cmtdcvbpu00dsv3gctpxpc469	round	Round neck	گول گلا	0	\N	1	t
cmtdcvbq300dyv3gcbrx0sbb5	cmtdcvbpu00dsv3gctpxpc469	shirt	Shirt collar	شرٹ کالر	15000	\N	2	t
cmtdcvbq500e0v3gc73kb38st	cmtdcvbpu00dsv3gctpxpc469	sherwani	Sherwani collar	شیروانی کالر	35000	\N	3	t
cmsx5rerc002uv3uwwhl3xukv	cmsx5rer8002sv3uwmtuaqcl0	plain	Plain	سادہ	0	\N	0	t
cmsx5rerg002wv3uwbk6t0uao	cmsx5rer8002sv3uwmtuaqcl0	bell	Bell	بیل	25000	\N	1	t
cmsx5rerk002yv3uwgxhcqnl8	cmsx5rer8002sv3uwmtuaqcl0	cuffed	Cuffed	کف والی	20000	\N	2	t
cmtdcvbqz00ekv3gcsuvfdwu0	cmtdcvbqt00egv3gctwq0nuax	three_quarter	Three-quarter	تین چوتھائی	0	\N	1	t
cmtdcvbr200emv3gc8xl53g9g	cmtdcvbqt00egv3gctwq0nuax	elbow	Elbow	کہنی تک	0	\N	2	t
cmtdcvbr500eov3gcm42t7cnb	cmtdcvbqt00egv3gctwq0nuax	short	Short	چھوٹی	-10000	\N	3	t
cmtdcvbrc00esv3gc9ntplevn	cmtdcvbr900eqv3gc5d1stc1u	plain	Plain	سادہ	0	\N	0	t
cmtdcvbrg00euv3gc7jc0sq1i	cmtdcvbr900eqv3gc5d1stc1u	buttoned	Buttoned	بٹن والا	20000	\N	1	t
cmtdcvbri00ewv3gcp2jybafz	cmtdcvbr900eqv3gc5d1stc1u	elasticated	Elasticated	ایلاسٹک والا	15000	\N	2	t
cmtdcvbrl00eyv3gcwowi4rn5	cmtdcvbr900eqv3gc5d1stc1u	churidar	Churidar	چوڑی دار	35000	\N	3	t
cmtdcvbrs00f2v3gc9dk6gl6s	cmtdcvbro00f0v3gcihhx4nam	open	Open	کھلی	0	\N	0	t
cmtdcvbrv00f4v3gc4rpf3hsg	cmtdcvbro00f0v3gcihhx4nam	hidden	Hidden placket	چھپی ہوئی پٹی	25000	\N	1	t
cmtdcvbry00f6v3gcmnku1jfi	cmtdcvbro00f0v3gcihhx4nam	button_through	Button-through	پورے بٹن	40000	\N	2	t
cmtdcvbs500fav3gccpkb9dpm	cmtdcvbs100f8v3gchryprm0y	plain	Plain	سادہ	0	\N	0	t
cmtdcvbs800fcv3gc3i8pu7pn	cmtdcvbs100f8v3gchryprm0y	gathered	Gathered	چنٹ والا	25000	\N	1	t
cmtdcvbsb00fev3gct47auond	cmtdcvbs100f8v3gchryprm0y	panelled	Panelled	پینل والا	35000	\N	2	t
cmtdcvbsh00fiv3gcfjc9mru5	cmtdcvbsd00fgv3gcaw6z5c6o	straight	Straight	سیدھا	0	\N	0	t
cmtdcvbsk00fkv3gcf9w1u7yo	cmtdcvbsd00fgv3gcaw6z5c6o	rounded	Rounded	گول	10000	\N	1	t
cmtdcvbsn00fmv3gc70a9vy8m	cmtdcvbsd00fgv3gcaw6z5c6o	side_slit	Side slits	سائیڈ چاک	10000	\N	2	t
cmtdcvbsq00fov3gc2amaq6yc	cmtdcvbsd00fgv3gcaw6z5c6o	high_low	High-low	آگے چھوٹا پیچھے لمبا	25000	\N	3	t
cmtdcvbsx00fsv3gcoop6zdsj	cmtdcvbst00fqv3gc1s7234jm	plain	Plain	سادہ	0	\N	0	t
cmtdcvbsz00fuv3gc4eb7mns9	cmtdcvbst00fqv3gc1s7234jm	piping	Piping	پائپنگ	20000	\N	1	t
cmtdcvbt300fwv3gcp6cmus8x	cmtdcvbst00fqv3gc1s7234jm	lace	Lace	لیس	45000	\N	2	t
cmtdcvbt500fyv3gcqfantn4l	cmtdcvbst00fqv3gc1s7234jm	embroidered	Embroidered border	کڑھائی والا بارڈر	90000	\N	3	t
cmtdcvbtb00g2v3gcphktb46u	cmtdcvbt800g0v3gcyo8f28my	plain	Plain	سادہ	0	\N	0	t
cmtdcvbte00g4v3gct9hqzbfv	cmtdcvbt800g0v3gcyo8f28my	keyhole	Keyhole	کی ہول	15000	\N	1	t
cmsx5resg003cv3uwwwgmvzfa	cmsx5resb003av3uwfqrqj0f1	straight	Straight	سیدھا	0	\N	0	t
cmsx5resk003ev3uwz6y1yzhl	cmsx5resb003av3uwfqrqj0f1	cigarette	Cigarette	سگریٹ	15000	\N	1	t
cmsx5reso003gv3uw1d3qjmzq	cmsx5resb003av3uwfqrqj0f1	bootcut	Bootcut	بوٹ کٹ	20000	\N	2	t
cmsx5reqk002kv3uwtul81stq	cmsx5req7002iv3uwwknk0g16	round	Round	گول	0	\N	0	t
cmsx5res30036v3uwd5ne2ei2	cmsx5rert0032v3uwmz5t53td	piping	Piping	پائپنگ	20000	\N	1	f
cmsx5res70038v3uwjvcpw3se	cmsx5rert0032v3uwmz5t53td	side_slits	Side slits	سائیڈ چاک	10000	\N	2	f
cmtdcvbtu00gcv3gcirg03myx	cmtdcvbtr00gav3gcrlpf8s4n	match_front	Match the front	اگلے دامن کے برابر	0	\N	0	t
cmtdcvbu100ggv3gc8dhlny29	cmtdcvbtr00gav3gcrlpf8s4n	longer	Longer than the front	اگلے سے لمبا	15000	\N	2	t
cmtdcvbu900gmv3gc7q1tjkpf	cmtdcvbu300giv3gcjmuo29s9	dori	Dori tie	ڈوری	20000	\N	1	t
cmtdcvbuc00gov3gcwd80mxv7	cmtdcvbu300giv3gcjmuo29s9	button	Buttons	بٹن	20000	\N	2	t
cmtdcvbug00gqv3gc9hxr60at	cmtdcvbu300giv3gcjmuo29s9	zip	Zip	زپ	25000	\N	3	t
cmtdcvbuy00h2v3gcgyh96c5r	cmsx5resb003av3uwfqrqj0f1	churidar	Churidar	چوڑی دار	30000	\N	4	t
cmtdcvbv400h6v3gcm49b3h7x	cmtdcvbv100h4v3gcaqe5pnit	elastic	Elastic	ایلاسٹک	0	\N	0	t
cmtdcvbv700h8v3gcv917jurp	cmtdcvbv100h4v3gcaqe5pnit	drawstring	Drawstring	ازار بند	0	\N	1	t
cmtdcvbva00hav3gci4z27b0l	cmtdcvbv100h4v3gcaqe5pnit	both	Both	دونوں	10000	\N	2	t
cmtdcvbvg00hev3gciajmtbw8	cmtdcvbvd00hcv3gchidl0ur8	plain	Plain	سادہ	0	\N	0	t
cmtdcvbvj00hgv3gcvfbayxht	cmtdcvbvd00hcv3gchidl0ur8	piping	Piping	پائپنگ	15000	\N	1	t
cmtdcvbvm00hiv3gcp9pr21x9	cmtdcvbvd00hcv3gchidl0ur8	lace	Lace	لیس	35000	\N	2	t
cmtdcvbvz00hqv3gcee79qx6l	cmsx5resy003kv3uwv7zmvv2w	patiala	Patiala	پٹیالہ	35000	\N	2	t
cmtdcvbw700hwv3gcqsx6zyp5	cmtdcvbw400huv3gcnfwwzv45	elastic	Elastic	ایلاسٹک	0	\N	0	t
cmtdcvbwa00hyv3gcxhp7wsgo	cmtdcvbw400huv3gcnfwwzv45	nala	Nala	نالہ	0	\N	1	t
cmtdcvbwd00i0v3gcrs0c2bxx	cmtdcvbw400huv3gcnfwwzv45	both	Both	دونوں	10000	\N	2	t
cmtdcvbwk00i4v3gcdn4x4txh	cmtdcvbwg00i2v3gcsndgjtf3	plain	Plain	سادہ	0	\N	0	t
cmtdcvbwm00i6v3gc5zadfbfo	cmtdcvbwg00i2v3gcsndgjtf3	piping	Piping	پائپنگ	15000	\N	1	t
cmtdcvbwp00i8v3gceb7cedx9	cmtdcvbwg00i2v3gcsndgjtf3	lace	Lace	لیس	35000	\N	2	t
cmtdcvbww00icv3gcycalsobf	cmtdcvbws00iav3gcvrrc9ade	none	None	کوئی نہیں	0	\N	0	t
cmtdcvbwz00iev3gcq2w8bnag	cmtdcvbws00iav3gcvrrc9ade	half	Half lining	آدھا استر	35000	\N	1	t
cmtdcvbx200igv3gc86gslvyx	cmtdcvbws00iav3gcvrrc9ade	full	Full lining	مکمل استر	70000	\N	2	t
cmtdcvbx500iiv3gcb8cicaba	cmtdcvbws00iav3gcvrrc9ade	shameez	Shameez (opaque under-lining)	شمیز	70000	\N	3	t
cmtdcvbxa00ikv3gc588t4ai0	cmtdcvbws00iav3gcvrrc9ade	astar	Astar (opaque under-lining)	استر	70000	\N	4	t
cmtdcvbxh00iov3gcagetcuwa	cmtdcvbxd00imv3gcgvgp8840	plain	Plain	سادہ	0	\N	0	t
cmtdcvbxk00iqv3gcdhha9cyp	cmtdcvbxd00imv3gcgvgp8840	covered	Fabric-covered	کپڑے والے	15000	\N	1	t
cmtdcvbxn00isv3gcifty9k0l	cmtdcvbxd00imv3gcgvgp8840	decorative	Decorative	ڈیزائنر	35000	\N	2	t
cmtdcvbxu00iwv3gccbb8h5x0	cmtdcvbxr00iuv3gchwicxhrl	neckline_patti	Neckline patti	گلے کی پٹی	90000	\N	0	t
cmtdcvbxx00iyv3gc7edihxa6	cmtdcvbxr00iuv3gchwicxhrl	sleeve_border	Sleeve border	آستین کا بارڈر	80000	\N	1	t
cmtdcvby000j0v3gcph2cg9mz	cmtdcvbxr00iuv3gchwicxhrl	daaman_border	Daaman border	دامن کا بارڈر	150000	\N	2	t
cmtdcvby300j2v3gcgvo8bnre	cmtdcvbxr00iuv3gchwicxhrl	back_motif	Back motif	پشت کا موٹف	60000	\N	3	t
cmtdcvbya00j6v3gcalth4maj	cmtdcvby700j4v3gc00h57wbq	none	None	کوئی نہیں	0	\N	0	t
cmtdcvbyd00j8v3gcie87cn5h	cmtdcvby700j4v3gc00h57wbq	satin_piping	Satin piping	ساٹن پائپنگ	20000	\N	1	t
cmtdcvbyf00jav3gc5ijrnmqr	cmtdcvby700j4v3gc00h57wbq	magzi_lining	Magzi lining	مغزی لائننگ	35000	\N	2	t
cmtdcvbym00jev3gc5ooyf3uc	cmtdcvbyi00jcv3gcsybmthja	none	None	کوئی نہیں	0	\N	0	t
cmtdcvbyp00jgv3gcobl2u1mc	cmtdcvbyi00jcv3gcsybmthja	gotta_border	Gotta border	گوٹہ بارڈر	50000	\N	1	t
cmtdcvbys00jiv3gc086a66v0	cmtdcvbyi00jcv3gcsybmthja	kiran_border	Kiran border	کرن بارڈر	65000	\N	2	t
cmtdcvbyy00jmv3gch9qxdf56	cmtdcvbyv00jkv3gckl0gp1p5	fitted	Fitted	فٹڈ	15000	\N	0	t
cmtdcvbz200jov3gckmjfkr1z	cmtdcvbyv00jkv3gckl0gp1p5	semi_fitted	Semi-fitted	نیم فٹڈ	0	\N	1	t
cmtdcvbz500jqv3gco31eig3o	cmtdcvbyv00jkv3gckl0gp1p5	relaxed	Relaxed	ڈھیلا	0	\N	2	t
cmtdcvbzc00juv3gcmind5tt2	cmtdcvbz800jsv3gc570x0cpb	6_panel	6-panel	6 پینل	0	\N	0	t
cmtdcvbzf00jwv3gcrgin5h26	cmtdcvbz800jsv3gc570x0cpb	8_panel	8-panel	8 پینل	40000	\N	1	t
cmtdcvbzi00jyv3gcp5nv6g5e	cmtdcvbz800jsv3gc570x0cpb	12_panel	12-panel	12 پینل	80000	\N	2	t
cmtdcvbzl00k0v3gc08mjh507	cmtdcvbz800jsv3gc570x0cpb	circular	Circular	سرکلر	120000	\N	3	t
cmtdcvbzr00k4v3gcljndebso	cmtdcvbzo00k2v3gcloub8rlk	straight_cut	Straight cut	سیدھا کٹ	0	\N	0	t
cmtdcvbzu00k6v3gczpx4je8y	cmtdcvbzo00k2v3gcloub8rlk	flared	Flared	پھیلا ہوا	35000	\N	1	t
cmtdcvbzy00k8v3gcn5ivn7aj	cmtdcvbzo00k2v3gcloub8rlk	wrap_style	Wrap style	ریپ اسٹائل	45000	\N	2	t
cmtdcvbti00g6v3gc4r7gi9li	cmtdcvbt800g0v3gcyo8f28my	button_back	Button back	پشت پر بٹن	35000	\N	2	t
cmtdcvbto00g8v3gcietwexve	cmtdcvbt800g0v3gcyo8f28my	open_back	Open back	کھلی پشت	40000	\N	3	t
cmtdcvbtx00gev3gceam6ujyo	cmtdcvbtr00gav3gcrlpf8s4n	straight	Straight	سیدھا	0	\N	1	t
cmtdcvbu600gkv3gc2ypp75b5	cmtdcvbu300giv3gcjmuo29s9	hook	Hooks	ہک	0	\N	0	t
\.


--
-- Data for Name: StitchingOptionGroup; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."StitchingOptionGroup" (id, key, "labelEn", "labelUr", "garmentTypeId", "selectionType", required, "order", "isActive", "createdAt", "updatedAt", area, "allowCustomText", "helpEn", "helpUr") FROM stdin;
cmtdcvbpe00div3gc2fptyjk3	neck_finish	Neck finish	گلے کی فنشنگ	cmsx5rek50007v3uwzg0vl4hk	SINGLE	f	2	t	2026-08-28 19:39:35.042	2026-08-28 23:11:55.67	neck	f	\N	\N
cmtdcvbpu00dsv3gctpxpc469	kurta_collar	Collar	کالر	cmsx5rent001gv3uwu7e5gsav	SINGLE	t	1	t	2026-08-28 19:39:35.058	2026-08-28 23:11:55.685	neck	f	\N	\N
cmsx5rer8002sv3uwmtuaqcl0	sleeve_style	Sleeve style	آستین	cmsx5rek50007v3uwzg0vl4hk	SINGLE	t	3	t	2026-08-17 11:36:16.244	2026-08-28 23:11:55.7	sleeves	t	\N	\N
cmtdcvbqt00egv3gctwq0nuax	sleeve_length	Sleeve length	آستین کی لمبائی	cmsx5rek50007v3uwzg0vl4hk	SINGLE	f	4	t	2026-08-28 19:39:35.093	2026-08-28 23:11:55.717	sleeves	f	\N	\N
cmtdcvbr900eqv3gc5d1stc1u	cuff_style	Cuff	کف	cmsx5rek50007v3uwzg0vl4hk	SINGLE	f	5	t	2026-08-28 19:39:35.109	2026-08-28 23:11:55.731	sleeves	f	Churidar gathers the sleeve into tight folds at the wrist.	چوڑی دار میں آستین کلائی پر چنٹ کے ساتھ تنگ ہو جاتی ہے۔
cmtdcvbro00f0v3gcihhx4nam	front_placket	Front placket	اگلی پٹی	cmsx5rek50007v3uwzg0vl4hk	SINGLE	f	6	t	2026-08-28 19:39:35.125	2026-08-28 23:11:55.745	upper_front	t	The strip of fabric that carries the front opening.	کپڑے کی وہ پٹی جس پر اگلا گلا کھلتا ہے۔
cmtdcvbs100f8v3gchryprm0y	yoke_style	Yoke	یوک	cmsx5rek50007v3uwzg0vl4hk	SINGLE	f	7	t	2026-08-28 19:39:35.137	2026-08-28 23:11:55.755	upper_front	t	The panel across the shoulders and upper chest.	کندھوں اور سینے کے اوپری حصے کا پینل۔
cmtdcvbsd00fgv3gcaw6z5c6o	front_hem	Front hem	اگلا دامن	cmsx5rek50007v3uwzg0vl4hk	SINGLE	f	8	t	2026-08-28 19:39:35.149	2026-08-28 23:11:55.766	lower_front	f	\N	\N
cmtdcvbst00fqv3gc1s7234jm	daaman_finish	Daaman finish	دامن کی فنشنگ	cmsx5rek50007v3uwzg0vl4hk	SINGLE	f	9	t	2026-08-28 19:39:35.166	2026-08-29 16:22:21.397	lower_front	t	The daaman is the bottom edge of the kameez.	دامن قمیض کا نچلا کنارہ ہے۔
cmtdcvbt800g0v3gcyo8f28my	back_style	Back style	پشت کا اسٹائل	cmsx5rek50007v3uwzg0vl4hk	SINGLE	f	10	t	2026-08-28 19:39:35.18	2026-08-28 23:11:55.796	back	t	How the back is cut. Describe a bespoke back below.	پشت کی کٹائی۔ کوئی خاص ڈیزائن نیچے لکھ دیں۔
cmtdcvbtr00gav3gcrlpf8s4n	back_hem	Back hem	پچھلا دامن	cmsx5rek50007v3uwzg0vl4hk	SINGLE	f	11	t	2026-08-28 19:39:35.199	2026-08-28 23:11:55.81	back	f	Matching the front keeps both hems the same length.	اگلے دامن کے برابر رکھنے پر دونوں ایک جیسے رہیں گے۔
cmtdcvbu300giv3gcjmuo29s9	blouse_back_closure	Back closure	پشت کی بندش	cmsx5rep30022v3uwxeh1yape	SINGLE	t	1	t	2026-08-28 19:39:35.212	2026-08-28 23:11:55.82	back	f	\N	\N
cmsx5resb003av3uwfqrqj0f1	trouser_cut	Trouser cut	ٹراؤزر کٹ	cmsx5remv0013v3uwg59rhzgv	SINGLE	t	1	t	2026-08-17 11:36:16.283	2026-08-28 23:11:55.835	trouser	f	\N	\N
cmtdcvbv100h4v3gcaqe5pnit	trouser_waist_finish	Trouser waist	ٹراؤزر کی کمر	cmsx5remv0013v3uwg59rhzgv	SINGLE	f	2	t	2026-08-28 19:39:35.245	2026-08-28 23:11:55.856	trouser	f	\N	\N
cmtdcvbvd00hcv3gchidl0ur8	trouser_paincha_finish	Trouser hem	ٹراؤزر کا پائنچہ	cmsx5remv0013v3uwg59rhzgv	SINGLE	f	3	t	2026-08-28 19:39:35.258	2026-08-28 23:11:55.869	trouser	f	The paincha is the opening at the bottom of the leg.	پائنچہ ٹانگ کے نچلے حصے کا کھلا کنارہ ہے۔
cmsx5resy003kv3uwv7zmvv2w	shalwar_style	Shalwar style	شلوار اسٹائل	cmsx5rem6000sv3uw27ole3ls	SINGLE	t	1	t	2026-08-17 11:36:16.307	2026-08-28 23:11:55.882	trouser	f	\N	\N
cmtdcvbw400huv3gcnfwwzv45	shalwar_waist_finish	Shalwar waist	شلوار کی کمر	cmsx5rem6000sv3uw27ole3ls	SINGLE	f	2	t	2026-08-28 19:39:35.284	2026-08-28 23:11:55.896	trouser	f	The nala is the traditional drawstring.	نالہ روایتی ازار بند ہے۔
cmtdcvbwg00i2v3gcsndgjtf3	shalwar_paincha_finish	Shalwar hem	شلوار کا پائنچہ	cmsx5rem6000sv3uw27ole3ls	SINGLE	f	3	t	2026-08-28 19:39:35.296	2026-08-28 23:11:55.907	trouser	f	\N	\N
cmtdcvbws00iav3gcvrrc9ade	lining	Lining	استر	\N	SINGLE	f	20	t	2026-08-28 19:39:35.309	2026-08-28 23:11:55.917	finishing	f	Half lining covers the bodice only; full lining covers the whole garment.	آدھا استر صرف اوپر کے حصے پر، مکمل استر پورے لباس پر۔
cmtdcvbxd00imv3gcgvgp8840	buttons	Buttons	بٹن	\N	SINGLE	f	21	t	2026-08-28 19:39:35.33	2026-08-28 23:11:55.934	finishing	f	\N	\N
cmtdcvbxr00iuv3gchwicxhrl	embroidery_placement	Embroidery placement	کڑھائی کی جگہ	\N	MULTI	f	22	t	2026-08-28 19:39:35.343	2026-08-28 23:11:55.947	finishing	t	Pick every place you want embroidery, then describe the design below.	جہاں جہاں کڑھائی چاہیے منتخب کریں، پھر ڈیزائن نیچے لکھ دیں۔
cmtdcvby700j4v3gc00h57wbq	piping_style	Piping style	پائپنگ اسٹائل	\N	SINGLE	f	23	t	2026-08-28 19:39:35.359	2026-08-28 23:11:55.961	finishing	f	Magzi lining is the traditional double-layer edge finish stitched under embroidery.	مغزی لائننگ روایتی دوہری تہہ کی کنارہ فنشنگ ہے جو کڑھائی کے نیچے کی جاتی ہے۔
cmtdcvbyi00jcv3gcsybmthja	trim_style	Trim style	ٹرم اسٹائل	\N	SINGLE	f	24	t	2026-08-28 19:39:35.371	2026-08-28 23:11:55.973	finishing	t	Pick a border style, then describe exact placement below.	بارڈر کا انداز منتخب کریں، پھر جگہ کی تفصیل نیچے لکھ دیں۔
cmtdcvbyv00jkv3gckl0gp1p5	bodice_fit	Bodice fit	بلاؤز فٹ	\N	SINGLE	f	1	t	2026-08-28 19:39:35.383	2026-08-28 23:11:55.984	bodice	t	How close the bodice sits to the body. Describe any custom shaping below.	بلاؤز جسم کے کتنا قریب ہو۔ کوئی خاص تراش نیچے لکھ دیں۔
cmtdcvbz800jsv3gc570x0cpb	skirt_flare	Skirt flare (panels)	اسکرٹ گھیرا (پینل)	\N	SINGLE	f	1	t	2026-08-28 19:39:35.397	2026-08-28 23:11:55.999	skirt_panel	t	Number of panels stitched into the flare — more panels means a fuller ghera. Describe any custom flare below.	گھیرے میں سلے پینلز کی تعداد — زیادہ پینل زیادہ گھیر دیتے ہیں۔ کوئی خاص تفصیل نیچے لکھ دیں۔
cmtdcvbzo00k2v3gcloub8rlk	outerwear_silhouette	Silhouette	کٹ کا انداز	\N	SINGLE	f	1	t	2026-08-28 19:39:35.412	2026-08-28 23:11:56.016	outerwear	t	The overall cut of the abaya, kaftan or maxi. Describe anything custom below.	عبایا، کفتان یا میکسی کا مجموعی کٹ۔ کوئی خاص ڈیزائن نیچے لکھ دیں۔
cmsx5rert0032v3uwmz5t53td	kameez_finish	Finishing	فنشنگ	cmsx5rek50007v3uwzg0vl4hk	MULTI	f	3	f	2026-08-17 11:36:16.265	2026-08-28 23:11:56.046	\N	f	\N	\N
cmsx5req7002iv3uwwknk0g16	neckline	Neckline	گلا	cmsx5rek50007v3uwzg0vl4hk	SINGLE	t	1	t	2026-08-17 11:36:16.207	2026-08-28 23:11:55.642	neck	t	The shape cut at the front of the neck. Describe anything custom below.	گلے کی اگلی شکل۔ کوئی خاص ڈیزائن نیچے لکھ دیں۔
\.


--
-- Data for Name: StitchingOrder; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."StitchingOrder" (id, number, "userId", "contactId", status, "guestName", "guestPhone", "guestEmail", "pickupAddress", "deliveryAddress", "fabricNotes", "staffNotes", "quotedFee", "fabricReceivedAt", "promisedAt", "createdAt", "updatedAt") FROM stdin;
cmsx5rfe9007rv3uwd32sl9is	STO-DEMO-0001	\N	\N	AWAITING_FABRIC	Sana Iqbal	+923005551001	\N	\N	\N	3 metres lawn, to be collected from Gulberg.	\N	\N	\N	2026-08-24 11:36:17.071	2026-08-17 11:36:17.073	2026-08-28 23:11:56.462
cmsx5rfgw007wv3uwuuwxt7u4	STO-DEMO-0002	\N	\N	IN_PRODUCTION	Hina Raza	+923005551002	\N	\N	\N	Khaddar suit, customer dropped it in.	\N	\N	2026-08-14 11:36:17.071	2026-08-24 11:36:17.071	2026-08-17 11:36:17.168	2026-08-28 23:11:56.483
cmsx5rfik008bv3uw0kp52dy0	STO-DEMO-0003	\N	\N	IN_PRODUCTION	Bilal Ahmed	+923005551003	\N	\N	\N	Two kurta pieces, wash-and-wear.	\N	\N	2026-08-14 11:36:17.071	2026-08-24 11:36:17.071	2026-08-17 11:36:17.229	2026-08-28 23:11:56.507
\.


--
-- Data for Name: StockAdjustment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."StockAdjustment" (id, "variantId", delta, "resultingStock", reason, note, "actorId", "createdAt") FROM stdin;
\.


--
-- Data for Name: StockCount; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."StockCount" (id, "countNumber", status, note, "startedAt", "completedAt", "cancelledAt", "createdBy", "assignedTo", "createdAt", "updatedAt") FROM stdin;
cmtdd8h6n00mgv3xwubp28xi7	SC-2026-0001	COMPLETED	Test	2026-08-28 19:49:48.739	2026-08-28 19:49:48.949	\N	cmsx5rdij0001v3uw5g02vyaq	\N	2026-08-28 19:49:48.671	2026-08-28 19:49:48.955
cmtel5pmr00mgv32s245tdr22	SC-2026-0002	COMPLETED	Test	2026-08-29 16:19:22.775	2026-08-29 16:19:22.84	\N	cmsx5rdij0001v3uw5g02vyaq	\N	2026-08-29 16:19:22.755	2026-08-29 16:19:22.842
cmtel7hjc00mgv3mc9ucfhr5g	SC-2026-0003	COMPLETED	Test	2026-08-29 16:20:45.589	2026-08-29 16:20:45.657	\N	cmsx5rdij0001v3uw5g02vyaq	\N	2026-08-29 16:20:45.576	2026-08-29 16:20:45.663
cmtel9ntq00mev33018qyqapg	SC-2026-0004	COMPLETED	Test	2026-08-29 16:22:27.049	2026-08-29 16:22:27.114	\N	cmsx5rdij0001v3uw5g02vyaq	\N	2026-08-29 16:22:27.038	2026-08-29 16:22:27.125
\.


--
-- Data for Name: StockCountLine; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."StockCountLine" (id, "stockCountId", "variantId", expected, counted, note, "createdAt", "updatedAt") FROM stdin;
cmtdd8h8000miv3xw3fwn88dy	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rfak0070v3uwz9neyuw2	9999	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8000mjv3xwrig6eebl	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rfbm007av3uw6wjrv9mo	9999	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8000mkv3xwnpd6gsn4	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rfcw007kv3uwmbuiq6zn	9999	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8100mlv3xw194kpnph	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rf5m0066v3uwsl6l4ag9	29	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8100mmv3xwwfm43b08	cmtdd8h6n00mgv3xwubp28xi7	cmsxkmqnw0006v33ojh3kgtb1	8	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8100mnv3xw6ehq2hu6	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rf2v005iv3uwfemuzv4e	8	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8100mov3xwqi89xvn7	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rf3n005sv3uwf8i72tnx	4	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8100mpv3xw564l5n11	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rf42005uv3uw7xbhosi5	6	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8100mqv3xw27eh327s	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rf4a005wv3uwppkmoz6j	3	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8100mrv3xwym4qp0tk	cmtdd8h6n00mgv3xwubp28xi7	cmt1dpur4005wv3ionvxe0ipt	30	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8100msv3xw87szot1y	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rf1f0052v3uwsuv23wed	18	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8100mtv3xwc26xh6ny	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rf2m005ev3uwckqmzj7j	20	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8100muv3xw6d6jlq7f	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rf2r005gv3uwlr9kwh43	15	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8100mvv3xwsrmveq0t	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rf7m006gv3uwoukrbm7y	101	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8100mwv3xwi9bhrabb	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rf09004sv3uwcpkuuky5	40	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8100mxv3xw1lkpjntc	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rexv004iv3uwhtv4yelr	199	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8200myv3xwpv1ldpzr	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rf2i005cv3uwk782tbox	11	\N	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.718
cmtdd8h8000mhv3xwkbsltbyj	cmtdd8h6n00mgv3xwubp28xi7	cmsx5rf8w006qv3uw4kyfgcaf	10	10	\N	2026-08-28 19:49:48.718	2026-08-28 19:49:48.896
cmtel5pn600mhv32sj9sckfri	cmtel5pmr00mgv32s245tdr22	cmsx5rfak0070v3uwz9neyuw2	9999	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn600miv32skvmu8z92	cmtel5pmr00mgv32s245tdr22	cmsx5rfbm007av3uw6wjrv9mo	9999	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn600mjv32s4he478p5	cmtel5pmr00mgv32s245tdr22	cmsx5rfcw007kv3uwmbuiq6zn	9999	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn600mkv32s6kj922g5	cmtel5pmr00mgv32s245tdr22	cmsx5rf5m0066v3uwsl6l4ag9	29	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn600mlv32sgpkz7x10	cmtel5pmr00mgv32s245tdr22	cmsxkmqnw0006v33ojh3kgtb1	8	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn700mmv32s84twzga5	cmtel5pmr00mgv32s245tdr22	cmsx5rf2v005iv3uwfemuzv4e	8	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn700mnv32s9bnzgerz	cmtel5pmr00mgv32s245tdr22	cmsx5rf3n005sv3uwf8i72tnx	4	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn700mov32s91dgoyim	cmtel5pmr00mgv32s245tdr22	cmsx5rf42005uv3uw7xbhosi5	6	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn700mpv32sjo412fhi	cmtel5pmr00mgv32s245tdr22	cmsx5rf4a005wv3uwppkmoz6j	3	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn700mqv32slpgwuatu	cmtel5pmr00mgv32s245tdr22	cmt1dpur4005wv3ionvxe0ipt	30	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn700mrv32seqf7fm64	cmtel5pmr00mgv32s245tdr22	cmsx5rf1f0052v3uwsuv23wed	18	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn700msv32syo5twzff	cmtel5pmr00mgv32s245tdr22	cmsx5rf2m005ev3uwckqmzj7j	20	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn700mtv32snaersvr6	cmtel5pmr00mgv32s245tdr22	cmsx5rf2r005gv3uwlr9kwh43	15	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn700muv32s6p4t1jxs	cmtel5pmr00mgv32s245tdr22	cmsx5rf7m006gv3uwoukrbm7y	101	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn700mvv32savineqe6	cmtel5pmr00mgv32s245tdr22	cmsx5rf09004sv3uwcpkuuky5	40	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn700mwv32sjlrovs8r	cmtel5pmr00mgv32s245tdr22	cmsx5rexv004iv3uwhtv4yelr	199	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn700mxv32sh54l037o	cmtel5pmr00mgv32s245tdr22	cmsx5rf2i005cv3uwk782tbox	11	\N	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.771
cmtel5pn700myv32s6zogau39	cmtel5pmr00mgv32s245tdr22	cmsx5rf8w006qv3uw4kyfgcaf	10	10	\N	2026-08-29 16:19:22.771	2026-08-29 16:19:22.821
cmtel7hjp00mhv3mcksjpnt79	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rfcw007kv3uwmbuiq6zn	9999	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjp00miv3mc6fyqcipg	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rf5m0066v3uwsl6l4ag9	29	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjp00mjv3mcs8z4m2h0	cmtel7hjc00mgv3mc9ucfhr5g	cmsxkmqnw0006v33ojh3kgtb1	8	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjp00mkv3mcjm529tr1	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rf2v005iv3uwfemuzv4e	8	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjp00mlv3mcjkntyh8y	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rf3n005sv3uwf8i72tnx	4	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjp00mmv3mcng3g6deg	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rf42005uv3uw7xbhosi5	6	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjp00mnv3mc7o8pjhxu	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rf4a005wv3uwppkmoz6j	3	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjp00mov3mcj10ei48a	cmtel7hjc00mgv3mc9ucfhr5g	cmt1dpur4005wv3ionvxe0ipt	30	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjp00mpv3mcy8pghbdq	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rf7m006gv3uwoukrbm7y	101	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjq00mqv3mcrrj4nb93	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rf1f0052v3uwsuv23wed	18	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjq00mrv3mct6aiy3hm	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rf2m005ev3uwckqmzj7j	20	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjq00msv3mc2mwd48cw	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rf2r005gv3uwlr9kwh43	15	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjq00mtv3mcipbji8r0	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rfak0070v3uwz9neyuw2	101	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjq00muv3mcim8nyxrd	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rf09004sv3uwcpkuuky5	40	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjq00mvv3mcl944hx8i	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rexv004iv3uwhtv4yelr	199	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjq00mwv3mcw1hwr37y	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rf2i005cv3uwk782tbox	10	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjq00myv3mcbvbna66g	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rf8w006qv3uw4kyfgcaf	10	\N	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.59
cmtel7hjq00mxv3mclgok1aog	cmtel7hjc00mgv3mc9ucfhr5g	cmsx5rfbm007av3uw6wjrv9mo	10	10	\N	2026-08-29 16:20:45.59	2026-08-29 16:20:45.641
cmtel9nu200mfv330rsrmc1a7	cmtel9ntq00mev33018qyqapg	cmsxkmqnw0006v33ojh3kgtb1	8	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu200mgv3309hxqg2yi	cmtel9ntq00mev33018qyqapg	cmsx5rf2v005iv3uwfemuzv4e	8	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu200mhv330t1vm6nj6	cmtel9ntq00mev33018qyqapg	cmsx5rf3n005sv3uwf8i72tnx	4	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300miv330mj5cfynq	cmtel9ntq00mev33018qyqapg	cmsx5rf42005uv3uw7xbhosi5	6	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300mjv330k59j434q	cmtel9ntq00mev33018qyqapg	cmsx5rf4a005wv3uwppkmoz6j	3	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300mkv330w9vfha8d	cmtel9ntq00mev33018qyqapg	cmt1dpur4005wv3ionvxe0ipt	30	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300mlv330orgpqtmq	cmtel9ntq00mev33018qyqapg	cmsx5rf1f0052v3uwsuv23wed	18	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300mmv3309gctlxpj	cmtel9ntq00mev33018qyqapg	cmsx5rf2m005ev3uwckqmzj7j	20	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300mnv330f6fa5ojh	cmtel9ntq00mev33018qyqapg	cmsx5rf2r005gv3uwlr9kwh43	15	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300mov330hmzrrfz1	cmtel9ntq00mev33018qyqapg	cmsx5rfcw007kv3uwmbuiq6zn	101	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300mpv330jhsoebx8	cmtel9ntq00mev33018qyqapg	cmsx5rf7m006gv3uwoukrbm7y	101	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300mqv3308y1ch03h	cmtel9ntq00mev33018qyqapg	cmsx5rfak0070v3uwz9neyuw2	101	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300mrv3305dtivjal	cmtel9ntq00mev33018qyqapg	cmsx5rf09004sv3uwcpkuuky5	40	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300msv330h2eanwcu	cmtel9ntq00mev33018qyqapg	cmsx5rexv004iv3uwhtv4yelr	199	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300mtv330uqw6e11y	cmtel9ntq00mev33018qyqapg	cmsx5rf2i005cv3uwk782tbox	9	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300mvv330acim2buz	cmtel9ntq00mev33018qyqapg	cmsx5rfbm007av3uw6wjrv9mo	10	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300mwv330u0dunead	cmtel9ntq00mev33018qyqapg	cmsx5rf8w006qv3uw4kyfgcaf	10	\N	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.051
cmtel9nu300muv330issp5xyi	cmtel9ntq00mev33018qyqapg	cmsx5rf5m0066v3uwsl6l4ag9	10	10	\N	2026-08-29 16:22:27.051	2026-08-29 16:22:27.102
\.


--
-- Data for Name: StockMovement; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."StockMovement" (id, "variantId", delta, "resultingStock", reason, "refType", "refId", "unitCost", note, "actorId", "createdAt") FROM stdin;
cmtdcvc3200l2v3gcox70msq4	cmsx5rexv004iv3uwhtv4yelr	-174	25	ADJUSTMENT	\N	\N	\N	seed	\N	2026-08-28 19:39:35.534
cmtdcvc6k00luv3gcp6tlatz5	cmsx5rf2i005cv3uwk782tbox	1	12	PURCHASE_RECEIPT	\N	\N	\N	seed	\N	2026-08-28 19:39:35.66
cmtdd5wh30019v3xw82ohq1oi	cmsx5rexv004iv3uwhtv4yelr	-1	199	SALE	Order	cmtdd5wfa0014v3xwze30p0xq	0	\N	\N	2026-08-28 19:47:48.52
cmtdd5ws3001tv3xwyzgfchup	cmsx5rf2i005cv3uwk782tbox	-1	11	SALE	Order	cmtdd5wr6001ov3xwq5hytdzi	0	\N	\N	2026-08-28 19:47:48.916
cmtdd61nz003lv3xwaae1wu9x	cmsx5rf2i005cv3uwk782tbox	-2	498	SALE	Order	cmtdd61mt003gv3xwbhm832bl	0	\N	\N	2026-08-28 19:47:55.247
cmtdd61r20041v3xw4gg665q2	cmsx5rf2i005cv3uwk782tbox	-1	497	SALE	Order	cmtdd61qh003wv3xwda845szi	0	\N	\N	2026-08-28 19:47:55.358
cmtdd61ts004hv3xwotot5tr7	cmsx5rf2i005cv3uwk782tbox	-1	496	SALE	Order	cmtdd61ta004cv3xwcsidh894	0	\N	\N	2026-08-28 19:47:55.457
cmtdd61wj004xv3xwckgdsep9	cmsx5rf2i005cv3uwk782tbox	-1	495	SALE	Order	cmtdd61vz004sv3xw8ny6cvbj	0	\N	\N	2026-08-28 19:47:55.556
cmtdd61zb005dv3xw6l6n4hj5	cmsx5rf2i005cv3uwk782tbox	-2	493	SALE	Order	cmtdd61yr0058v3xwiueoj6fy	0	\N	\N	2026-08-28 19:47:55.656
cmtdd6228005tv3xw210vr8sn	cmsx5rf2i005cv3uwk782tbox	-1	492	SALE	Order	cmtdd621o005ov3xwym95ds1x	0	\N	\N	2026-08-28 19:47:55.761
cmtdd62680069v3xww9unqud9	cmsx5rf2i005cv3uwk782tbox	-1	491	SALE	Order	cmtdd625o0064v3xwdiivicu5	0	\N	\N	2026-08-28 19:47:55.904
cmtdd629g006pv3xwf4btojwy	cmsx5rf2i005cv3uwk782tbox	-1	490	SALE	Order	cmtdd628u006kv3xwdjbpzc7n	0	\N	\N	2026-08-28 19:47:56.021
cmtdd62ef0075v3xwa439fqb2	cmsx5rf2i005cv3uwk782tbox	-1	489	SALE	Order	cmtdd62dh0070v3xwsynnx0b1	0	\N	\N	2026-08-28 19:47:56.199
cmtdd636a008hv3xwpe7iktmw	cmsx5rexv004iv3uwhtv4yelr	-1	198	SALE	Order	cmtdd634z008cv3xwb57fx3c3	0	\N	\N	2026-08-28 19:47:57.202
cmtdd63jz008tv3xw3v5e7egc	cmsx5rf09004sv3uwcpkuuky5	-1	39	SALE	Order	cmtdd63if008ov3xwn75hsvcp	0	\N	\N	2026-08-28 19:47:57.696
cmtdd63mi0095v3xwdlljuf0x	cmsx5rf1f0052v3uwsuv23wed	-1	17	SALE	Order	cmtdd63ky0090v3xwl9mhzqre	0	\N	\N	2026-08-28 19:47:57.787
cmtdd63pk009hv3xwremv5mow	cmsx5rf2r005gv3uwlr9kwh43	-1	14	SALE	Order	cmtdd63nj009cv3xw1ooijue4	0	\N	\N	2026-08-28 19:47:57.897
cmtdd63t1009tv3xws7v9dbu9	cmsx5rf2i005cv3uwk782tbox	-1	488	SALE	Order	cmtdd63r3009ov3xwfz3fr1ft	0	\N	\N	2026-08-28 19:47:58.022
cmtdd63x500a5v3xwgs86p15y	cmsx5rf2m005ev3uwckqmzj7j	-1	19	SALE	Order	cmtdd63ur00a0v3xw5zk977hh	0	\N	\N	2026-08-28 19:47:58.169
cmtdd646g00apv3xw21xliuso	cmsx5rf7m006gv3uwoukrbm7y	-1	0	SALE	Order	cmtdd645g00akv3xwknl26n7c	0	\N	\N	2026-08-28 19:47:58.504
cmtdd64lt00bjv3xwgy4o368b	cmsx5rexv004iv3uwhtv4yelr	-1	197	SALE	Order	cmtdd64it00bdv3xwueu10rnd	0	\N	\N	2026-08-28 19:47:59.057
cmtdd64mt00bnv3xwu5m3txj4	cmsx5rf09004sv3uwcpkuuky5	-1	38	SALE	Order	cmtdd64it00bdv3xwueu10rnd	0	\N	\N	2026-08-28 19:47:59.093
cmtdd64pl00c0v3xw86ie9e19	cmsx5rexv004iv3uwhtv4yelr	-1	196	SALE	Order	cmtdd64o400buv3xwj72pw1pw	0	\N	\N	2026-08-28 19:47:59.193
cmtdd64q900c4v3xw7tptvt5u	cmsx5rf09004sv3uwcpkuuky5	-1	37	SALE	Order	cmtdd64o400buv3xwj72pw1pw	0	\N	\N	2026-08-28 19:47:59.217
cmtdd65v700ckv3xwh6srrkiz	cmsx5rexv004iv3uwhtv4yelr	-1	195	SALE	Order	cmtdd65ub00cfv3xwp28m3uhy	0	\N	\N	2026-08-28 19:48:00.691
cmtdd661b00d0v3xw3znzo2w8	cmsx5rexv004iv3uwhtv4yelr	-1	194	SALE	Order	cmtdd660b00cvv3xw5rdsfhee	0	\N	\N	2026-08-28 19:48:00.911
cmtdd679100duv3xwon87zjh5	cmsx5rf2i005cv3uwk782tbox	-1	487	SALE	Order	cmtdd678000dpv3xw5enxvv6y	0	\N	\N	2026-08-28 19:48:02.485
cmtdd67jl00eev3xwe3cv2wh9	cmsx5rf2i005cv3uwk782tbox	-1	486	SALE	Order	cmtdd67id00e9v3xwmohp3uth	0	\N	\N	2026-08-28 19:48:02.865
cmtdd67pj00evv3xwn41mbad1	cmsx5rf2i005cv3uwk782tbox	-1	485	SALE	Order	cmtdd67ny00eqv3xw646u1p8x	0	\N	\N	2026-08-28 19:48:03.079
cmtdd68br00g0v3xwviw76v4o	cmsx5rf2i005cv3uwk782tbox	-2	483	SALE	Order	cmtdd68aw00fvv3xwxvgkw9pp	0	\N	\N	2026-08-28 19:48:03.879
cmtdd68ed00g9v3xw5a302dr1	cmsx5rf2i005cv3uwk782tbox	2	485	CANCELLATION	Order	cmtdd68aw00fvv3xwxvgkw9pp	\N	\N	cmsx5rcwn0000v3uwukkiufkd	2026-08-28 19:48:03.973
cmtdd68jg00gpv3xw5ma2g2xk	cmsx5rf2i005cv3uwk782tbox	-1	484	SALE	Order	cmtdd68ie00gkv3xwpev9i8kp	0	\N	\N	2026-08-28 19:48:04.156
cmtdd6lad00h9v3xwbi9manvw	cmsx5rf2i005cv3uwk782tbox	-1	199	SALE	Order	cmtdd6l7q00h4v3xwkihsi3c7	0	\N	\N	2026-08-28 19:48:20.677
cmtdd6mi400hrv3xwx22j5ahz	cmsx5rf2i005cv3uwk782tbox	-1	198	SALE	Order	cmtdd6mew00hmv3xwq12rsxrr	0	\N	\N	2026-08-28 19:48:22.252
cmtdd6oux00i7v3xwkurnqe3k	cmsx5rf2i005cv3uwk782tbox	-1	197	SALE	Order	cmtdd6osp00i2v3xw9bilpyxg	0	\N	\N	2026-08-28 19:48:25.306
cmtdd6pid00igv3xwmmyxkwtr	cmsx5rf2i005cv3uwk782tbox	1	198	CANCELLATION	Order	cmtdd6osp00i2v3xw9bilpyxg	\N	\N	cmsx5rcwn0000v3uwukkiufkd	2026-08-28 19:48:26.149
cmtdd6uq100jdv3xwdromacg4	cmsx5rf2i005cv3uwk782tbox	-1	197	SALE	Order	cmtdd6uoe00j8v3xwv4vgt56v	0	\N	\N	2026-08-28 19:48:32.905
cmtdd6v2600jvv3xwl8wcrfoy	cmsx5rf2i005cv3uwk782tbox	-1	196	SALE	Order	cmtdd6v1b00jqv3xws6up9vpi	0	\N	\N	2026-08-28 19:48:33.342
cmtdd8hc600n0v3xwsdvjjh25	cmsx5rf8w006qv3uw4kyfgcaf	-2	8	SALE	\N	\N	\N	\N	\N	2026-08-28 19:49:48.87
cmtdd8hec00n2v3xwjr0xg58y	cmsx5rf8w006qv3uw4kyfgcaf	2	10	COUNT	StockCount	cmtdd8h6n00mgv3xwubp28xi7	\N	\N	cmsx5rdij0001v3uw5g02vyaq	2026-08-28 19:49:48.948
cmtdef7oi00iiv3dspvext7gx	cmsx5rexv004iv3uwhtv4yelr	-174	25	ADJUSTMENT	\N	\N	\N	seed	\N	2026-08-28 20:23:02.562
cmtdef7rt00jav3ds2gpepi0e	cmsx5rf2i005cv3uwk782tbox	1	12	PURCHASE_RECEIPT	\N	\N	\N	seed	\N	2026-08-28 20:23:02.681
cmtdef7uk00kcv3dse1mzwl8s	cmsx5rf7m006gv3uwoukrbm7y	9898	9999	ADJUSTMENT	\N	\N	\N	seed	\N	2026-08-28 20:23:02.78
cmtdef7vf00kov3dsw6vxjds7	cmsx5rf8w006qv3uw4kyfgcaf	9989	9999	ADJUSTMENT	\N	\N	\N	seed	\N	2026-08-28 20:23:02.812
cmtel4y5v000cv32sg0569vpl	cmsx5rf2i005cv3uwk782tbox	-2	498	SALE	Order	cmtel4y470007v32s1hb04y2w	0	\N	\N	2026-08-29 16:18:47.155
cmtel4y9e000sv32s3qahr923	cmsx5rf2i005cv3uwk782tbox	-1	497	SALE	Order	cmtel4y8y000nv32smcbrj9bn	0	\N	\N	2026-08-29 16:18:47.282
cmtel4ybo0018v32sa9ve9hwx	cmsx5rf2i005cv3uwk782tbox	-1	496	SALE	Order	cmtel4yb90013v32sy95qcyip	0	\N	\N	2026-08-29 16:18:47.365
cmtel4ye0001ov32sca8emqxe	cmsx5rf2i005cv3uwk782tbox	-1	495	SALE	Order	cmtel4ydj001jv32se1yzvq9n	0	\N	\N	2026-08-29 16:18:47.448
cmtel4ygb0024v32sufgz9t7y	cmsx5rf2i005cv3uwk782tbox	-2	493	SALE	Order	cmtel4yfv001zv32s9mpawn7i	0	\N	\N	2026-08-29 16:18:47.531
cmtel4yjr002kv32sngigcqyi	cmsx5rf2i005cv3uwk782tbox	-1	492	SALE	Order	cmtel4yj4002fv32sib7y11d8	0	\N	\N	2026-08-29 16:18:47.655
cmtel4yrg0030v32sc7w38ogn	cmsx5rf2i005cv3uwk782tbox	-1	491	SALE	Order	cmtel4yqz002vv32s14f2im04	0	\N	\N	2026-08-29 16:18:47.933
cmtel4ytw003gv32s3sq23fca	cmsx5rf2i005cv3uwk782tbox	-1	490	SALE	Order	cmtel4yth003bv32srci7ix5m	0	\N	\N	2026-08-29 16:18:48.021
cmtel4yvz003wv32szsz9wtnq	cmsx5rf2i005cv3uwk782tbox	-1	489	SALE	Order	cmtel4yvl003rv32s5gqur8qj	0	\N	\N	2026-08-29 16:18:48.096
cmtel4z7y0058v32svzz5e4uk	cmsx5rexv004iv3uwhtv4yelr	-1	24	SALE	Order	cmtel4z6l0053v32s2c3a3j4j	0	\N	\N	2026-08-29 16:18:48.526
cmtel4zdq005kv32sguxcutbi	cmsx5rf2r005gv3uwlr9kwh43	-1	14	SALE	Order	cmtel4zde005fv32sk8uwgyts	0	\N	\N	2026-08-29 16:18:48.735
cmtel4zf2005wv32s4deg2kqm	cmsx5rf09004sv3uwcpkuuky5	-1	39	SALE	Order	cmtel4ze7005rv32sk470qlhk	0	\N	\N	2026-08-29 16:18:48.783
cmtel4zgo0068v32sqbostwc0	cmsx5rf1f0052v3uwsuv23wed	-1	17	SALE	Order	cmtel4zft0063v32svn525kki	0	\N	\N	2026-08-29 16:18:48.841
cmtel4zia006kv32s2xz8trmc	cmsx5rf2i005cv3uwk782tbox	-1	488	SALE	Order	cmtel4zhd006fv32s08edjoa4	0	\N	\N	2026-08-29 16:18:48.899
cmtel4zjv006wv32sifj38k96	cmsx5rf2m005ev3uwckqmzj7j	-1	19	SALE	Order	cmtel4zj0006rv32s89tpfr39	0	\N	\N	2026-08-29 16:18:48.955
cmtel4zny007gv32s8lpb3gh7	cmsx5rf7m006gv3uwoukrbm7y	-1	0	SALE	Order	cmtel4zng007bv32s3meug8ge	0	\N	\N	2026-08-29 16:18:49.102
cmtel4zun008av32s208xcdfx	cmsx5rexv004iv3uwhtv4yelr	-1	23	SALE	Order	cmtel4ztz0084v32s1gx5mpd7	0	\N	\N	2026-08-29 16:18:49.344
cmtel4zv1008ev32s4y07utwb	cmsx5rf09004sv3uwcpkuuky5	-1	38	SALE	Order	cmtel4ztz0084v32s1gx5mpd7	0	\N	\N	2026-08-29 16:18:49.358
cmtel4zw3008rv32subcnjrhp	cmsx5rexv004iv3uwhtv4yelr	-1	22	SALE	Order	cmtel4zvj008lv32ssdjje5ur	0	\N	\N	2026-08-29 16:18:49.395
cmtel4zwl008vv32s1n1eksur	cmsx5rf09004sv3uwcpkuuky5	-1	37	SALE	Order	cmtel4zvj008lv32ssdjje5ur	0	\N	\N	2026-08-29 16:18:49.414
cmtel50ig009bv32skox54y0g	cmsx5rexv004iv3uwhtv4yelr	-1	21	SALE	Order	cmtel50hx0096v32ssu12tzuu	0	\N	\N	2026-08-29 16:18:50.2
cmtel50m8009rv32sz4rfpc80	cmsx5rexv004iv3uwhtv4yelr	-1	20	SALE	Order	cmtel50lo009mv32ssj7xhm8m	0	\N	\N	2026-08-29 16:18:50.336
cmtel517m00adv32slhyqei5g	cmsx5rf2i005cv3uwk782tbox	-1	487	SALE	Order	cmtel517300a8v32sz3lkr6t9	0	\N	\N	2026-08-29 16:18:51.107
cmtel51c200axv32s8obsmtmk	cmsx5rf2i005cv3uwk782tbox	-1	486	SALE	Order	cmtel51bk00asv32stpoycmw0	0	\N	\N	2026-08-29 16:18:51.266
cmtel51ek00bev32s7wou7twe	cmsx5rf2i005cv3uwk782tbox	-1	485	SALE	Order	cmtel51e000b9v32shrrsn8ub	0	\N	\N	2026-08-29 16:18:51.356
cmtel51pk00cnv32ss43c9jpp	cmsx5rf2i005cv3uwk782tbox	-2	483	SALE	Order	cmtel51p000chv32sz6t1dh7o	0	\N	\N	2026-08-29 16:18:51.753
cmtel51qy00cwv32s240olfao	cmsx5rf2i005cv3uwk782tbox	2	485	CANCELLATION	Order	cmtel51p000chv32sz6t1dh7o	\N	\N	cmsx5rcwn0000v3uwukkiufkd	2026-08-29 16:18:51.803
cmtel51uj00dgv32s41bsrhj2	cmsx5rf2i005cv3uwk782tbox	-1	484	SALE	Order	cmtel51tw00dbv32s9g02cpe4	0	\N	\N	2026-08-29 16:18:51.931
cmtel5hzh00h7v32sikycy9mf	cmsx5rf2i005cv3uwk782tbox	-1	199	SALE	Order	cmtel5hyl00h2v32sg1wx9o8k	0	\N	\N	2026-08-29 16:19:12.845
cmtel5i4600hpv32s3i6mc9ew	cmsx5rf2i005cv3uwk782tbox	-1	198	SALE	Order	cmtel5i3q00hkv32smss6u0zr	0	\N	\N	2026-08-29 16:19:13.015
cmtel5i9n00i5v32skzdqv1tw	cmsx5rf2i005cv3uwk782tbox	-1	197	SALE	Order	cmtel5i9400i0v32slooode22	0	\N	\N	2026-08-29 16:19:13.211
cmtel5ibq00iev32skvhg6rcv	cmsx5rf2i005cv3uwk782tbox	1	198	CANCELLATION	Order	cmtel5i9400i0v32slooode22	\N	\N	cmsx5rcwn0000v3uwukkiufkd	2026-08-29 16:19:13.287
cmtel5jsb00jbv32sl6g7jv7l	cmsx5rf2i005cv3uwk782tbox	-1	197	SALE	Order	cmtel5jrh00j6v32sl0i6ldy9	0	\N	\N	2026-08-29 16:19:15.179
cmtel5jyu00jtv32smv2b5fby	cmsx5rf2i005cv3uwk782tbox	-1	196	SALE	Order	cmtel5jya00jov32sins2nd4q	0	\N	\N	2026-08-29 16:19:15.414
cmtel5nbw00kfv32sgmkgnleo	cmsx5rexv004iv3uwhtv4yelr	-1	199	SALE	Order	cmtel5nav00kav32sqi913koo	0	\N	\N	2026-08-29 16:19:19.772
cmtel5nnq00kzv32s2qh4nfaz	cmsx5rf2i005cv3uwk782tbox	-1	11	SALE	Order	cmtel5nn400kuv32saqsohnkr	0	\N	\N	2026-08-29 16:19:20.198
cmtel5po900n0v32s4dip8yqe	cmsx5rf8w006qv3uw4kyfgcaf	-2	8	SALE	\N	\N	\N	\N	\N	2026-08-29 16:19:22.81
cmtel5pp300n2v32sfya0ybcl	cmsx5rf8w006qv3uw4kyfgcaf	2	10	COUNT	StockCount	cmtel5pmr00mgv32s245tdr22	\N	\N	cmsx5rdij0001v3uw5g02vyaq	2026-08-29 16:19:22.84
cmtel6nyy000cv3mcgscykb21	cmsx5rf2i005cv3uwk782tbox	-1	199	SALE	Order	cmtel6nxp0007v3mc3vl8870u	0	\N	\N	2026-08-29 16:20:07.259
cmtel6o3q000uv3mcma3u64xn	cmsx5rf2i005cv3uwk782tbox	-1	198	SALE	Order	cmtel6o33000pv3mc8ewdwo4n	0	\N	\N	2026-08-29 16:20:07.43
cmtel6obj001av3mcp1cvt4mb	cmsx5rf2i005cv3uwk782tbox	-1	197	SALE	Order	cmtel6oar0015v3mccn2961jl	0	\N	\N	2026-08-29 16:20:07.712
cmtel6oec001jv3mca5dokbla	cmsx5rf2i005cv3uwk782tbox	1	198	CANCELLATION	Order	cmtel6oar0015v3mccn2961jl	\N	\N	cmsx5rcwn0000v3uwukkiufkd	2026-08-29 16:20:07.813
cmtel6pxx002gv3mcyq02kqd4	cmsx5rf2i005cv3uwk782tbox	-1	197	SALE	Order	cmtel6px2002bv3mczfm1bfhd	0	\N	\N	2026-08-29 16:20:09.813
cmtel6q4s002yv3mclnvll92n	cmsx5rf2i005cv3uwk782tbox	-1	196	SALE	Order	cmtel6q47002tv3mcuhkuhp6a	0	\N	\N	2026-08-29 16:20:10.06
cmtel6tdu003iv3mc2inj0e90	cmsx5rf2i005cv3uwk782tbox	-2	498	SALE	Order	cmtel6tcx003dv3mcl5xnf6pa	0	\N	\N	2026-08-29 16:20:14.275
cmtel6tgn003yv3mcca1c7x4w	cmsx5rf2i005cv3uwk782tbox	-1	497	SALE	Order	cmtel6tg4003tv3mcm6p69bwi	0	\N	\N	2026-08-29 16:20:14.375
cmtel6tj3004ev3mc3umuvc33	cmsx5rf2i005cv3uwk782tbox	-1	496	SALE	Order	cmtel6til0049v3mc96gdxywo	0	\N	\N	2026-08-29 16:20:14.463
cmtel6tlo004uv3mc6k8lyr5c	cmsx5rf2i005cv3uwk782tbox	-1	495	SALE	Order	cmtel6tl6004pv3mcvvbxhrmf	0	\N	\N	2026-08-29 16:20:14.556
cmtel6to2005av3mc8y4gscwt	cmsx5rf2i005cv3uwk782tbox	-2	493	SALE	Order	cmtel6tnk0055v3mcfhzmg933	0	\N	\N	2026-08-29 16:20:14.643
cmtel6tqh005qv3mcn10oifdx	cmsx5rf2i005cv3uwk782tbox	-1	492	SALE	Order	cmtel6tq0005lv3mcrugsvjt4	0	\N	\N	2026-08-29 16:20:14.73
cmtel6tt80066v3mc9n1sfhmt	cmsx5rf2i005cv3uwk782tbox	-1	491	SALE	Order	cmtel6tsr0061v3mcsl3g3yjz	0	\N	\N	2026-08-29 16:20:14.828
cmtel6tvm006mv3mco99pxg1z	cmsx5rf2i005cv3uwk782tbox	-1	490	SALE	Order	cmtel6tv8006hv3mciwp3ilzx	0	\N	\N	2026-08-29 16:20:14.914
cmtel6txz0072v3mckgkcwa8b	cmsx5rf2i005cv3uwk782tbox	-1	489	SALE	Order	cmtel6txi006xv3mcs0orf5ub	0	\N	\N	2026-08-29 16:20:14.999
cmtel6u9z008ev3mce4u7y64k	cmsx5rf2i005cv3uwk782tbox	-1	488	SALE	Order	cmtel6u8w0089v3mcfzdterba	0	\N	\N	2026-08-29 16:20:15.432
cmtel6uj3008qv3mcpvgtg2hm	cmsx5rf09004sv3uwcpkuuky5	-1	39	SALE	Order	cmtel6uhn008lv3mc5nrfbghp	0	\N	\N	2026-08-29 16:20:15.76
cmtel6uls0092v3mcsb78lodg	cmsx5rf1f0052v3uwsuv23wed	-1	17	SALE	Order	cmtel6ukd008xv3mc5s5wz6pc	0	\N	\N	2026-08-29 16:20:15.856
cmtel6uo5009ev3mcte3462lo	cmsx5rf2m005ev3uwckqmzj7j	-1	19	SALE	Order	cmtel6umv0099v3mcrjd1fv3t	0	\N	\N	2026-08-29 16:20:15.941
cmtel6uq6009qv3mclesajwtt	cmsx5rf2r005gv3uwlr9kwh43	-1	14	SALE	Order	cmtel6up1009lv3mcqjd6m9m3	0	\N	\N	2026-08-29 16:20:16.014
cmtel6usa00a2v3mcggex385o	cmsx5rexv004iv3uwhtv4yelr	-1	198	SALE	Order	cmtel6ur4009xv3mcviqk8d9m	0	\N	\N	2026-08-29 16:20:16.09
cmtel6ux000amv3mci4iabbox	cmsx5rfak0070v3uwz9neyuw2	-1	0	SALE	Order	cmtel6uwi00ahv3mcq7yznerb	0	\N	\N	2026-08-29 16:20:16.261
cmtel6v4i00bgv3mczfayixa5	cmsx5rexv004iv3uwhtv4yelr	-1	197	SALE	Order	cmtel6v3v00bav3mcqb2fe7hz	0	\N	\N	2026-08-29 16:20:16.53
cmtel6v4t00bkv3mcavhrkm25	cmsx5rf09004sv3uwcpkuuky5	-1	38	SALE	Order	cmtel6v3v00bav3mcqb2fe7hz	0	\N	\N	2026-08-29 16:20:16.542
cmtel6v5u00bxv3mcxsnsw8q6	cmsx5rexv004iv3uwhtv4yelr	-1	196	SALE	Order	cmtel6v5a00brv3mc2nka7y4w	0	\N	\N	2026-08-29 16:20:16.578
cmtel6v6500c1v3mcgobocg63	cmsx5rf09004sv3uwcpkuuky5	-1	37	SALE	Order	cmtel6v5a00brv3mc2nka7y4w	0	\N	\N	2026-08-29 16:20:16.59
cmtel6vo400chv3mcwoon1njj	cmsx5rexv004iv3uwhtv4yelr	-1	195	SALE	Order	cmtel6vnl00ccv3mcs9zpofp9	0	\N	\N	2026-08-29 16:20:17.237
cmtel6vrg00cxv3mc8mb8eru7	cmsx5rexv004iv3uwhtv4yelr	-1	194	SALE	Order	cmtel6vqv00csv3mc56fa281q	0	\N	\N	2026-08-29 16:20:17.356
cmtel6wfe00dnv3mc11syua12	cmsx5rf2i005cv3uwk782tbox	-1	487	SALE	Order	cmtel6wep00dhv3mci6uz9woq	0	\N	\N	2026-08-29 16:20:18.218
cmtel6wl300ebv3mchgeje55l	cmsx5rf2i005cv3uwk782tbox	-1	486	SALE	Order	cmtel6wkj00e6v3mcxbtdbobp	0	\N	\N	2026-08-29 16:20:18.424
cmtel6wo200esv3mc9damffgq	cmsx5rf2i005cv3uwk782tbox	-1	485	SALE	Order	cmtel6wnl00env3mci83ezvzx	0	\N	\N	2026-08-29 16:20:18.531
cmtel6wz000fxv3mchrt1nfc2	cmsx5rf2i005cv3uwk782tbox	-2	483	SALE	Order	cmtel6wyf00fsv3mcy3bqw9ue	0	\N	\N	2026-08-29 16:20:18.924
cmtel6x0d00g6v3mcmola8gbk	cmsx5rf2i005cv3uwk782tbox	2	485	CANCELLATION	Order	cmtel6wyf00fsv3mcy3bqw9ue	\N	\N	cmsx5rcwn0000v3uwukkiufkd	2026-08-29 16:20:18.974
cmtel6x3200gmv3mcm02p87ct	cmsx5rf2i005cv3uwk782tbox	-1	484	SALE	Order	cmtel6x2i00ghv3mc4qo0fa4y	0	\N	\N	2026-08-29 16:20:19.07
cmtel7aqn00k1v3mcnj5ce1ba	cmsx5rexv004iv3uwhtv4yelr	-1	199	SALE	Order	cmtel7aow00jwv3mc0wsdb24r	0	\N	\N	2026-08-29 16:20:36.767
cmtel7b2b00klv3mc67vd2r5p	cmsx5rf2i005cv3uwk782tbox	-1	10	SALE	Order	cmtel7b1p00kgv3mcf8jxz2cx	0	\N	\N	2026-08-29 16:20:37.187
cmtel7hkt00n0v3mc8ftrz882	cmsx5rfbm007av3uw6wjrv9mo	-2	8	SALE	\N	\N	\N	\N	\N	2026-08-29 16:20:45.629
cmtel7hlo00n2v3mc16ut3uff	cmsx5rfbm007av3uw6wjrv9mo	2	10	COUNT	StockCount	cmtel7hjc00mgv3mc9ucfhr5g	\N	\N	cmsx5rdij0001v3uw5g02vyaq	2026-08-29 16:20:45.661
cmtel8ut0000cv330wm4fi2aj	cmsx5rf2i005cv3uwk782tbox	-1	199	SALE	Order	cmtel8urv0007v330s5htqz7b	0	\N	\N	2026-08-29 16:21:49.428
cmtel8uxi000uv3302dlgv8ug	cmsx5rf2i005cv3uwk782tbox	-1	198	SALE	Order	cmtel8ux0000pv3300rqsn0ny	0	\N	\N	2026-08-29 16:21:49.59
cmtel8v49001av330eraxmuv8	cmsx5rf2i005cv3uwk782tbox	-1	197	SALE	Order	cmtel8v3q0015v330mn0ea5vm	0	\N	\N	2026-08-29 16:21:49.833
cmtel8v6p001jv330kn8peczo	cmsx5rf2i005cv3uwk782tbox	1	198	CANCELLATION	Order	cmtel8v3q0015v330mn0ea5vm	\N	\N	cmsx5rcwn0000v3uwukkiufkd	2026-08-29 16:21:49.922
cmtel8wpn002gv330c8knv28u	cmsx5rf2i005cv3uwk782tbox	-1	197	SALE	Order	cmtel8wot002bv330pnn75hac	0	\N	\N	2026-08-29 16:21:51.899
cmtel8wwc002yv330lg3onrc9	cmsx5rf2i005cv3uwk782tbox	-1	196	SALE	Order	cmtel8wvv002tv330dh68m1si	0	\N	\N	2026-08-29 16:21:52.14
cmtel8zma003gv330qbcfvmkp	cmsx5rf2i005cv3uwk782tbox	-2	498	SALE	Order	cmtel8zlf003bv33076xe97xs	0	\N	\N	2026-08-29 16:21:55.666
cmtel8zoz003wv330l10pmjsj	cmsx5rf2i005cv3uwk782tbox	-1	497	SALE	Order	cmtel8zoe003rv330a1qritsm	0	\N	\N	2026-08-29 16:21:55.763
cmtel8zrk004cv33063pe7346	cmsx5rf2i005cv3uwk782tbox	-1	496	SALE	Order	cmtel8zr20047v330qyfvv3yp	0	\N	\N	2026-08-29 16:21:55.856
cmtel8zu3004sv330p0gjfpbu	cmsx5rf2i005cv3uwk782tbox	-1	495	SALE	Order	cmtel8ztj004nv330czirmzyw	0	\N	\N	2026-08-29 16:21:55.947
cmtel8zwl0058v330xevfxowr	cmsx5rf2i005cv3uwk782tbox	-2	493	SALE	Order	cmtel8zw40053v330vfbwmjuj	0	\N	\N	2026-08-29 16:21:56.037
cmtel8zyw005ov330w0pyqfms	cmsx5rf2i005cv3uwk782tbox	-1	492	SALE	Order	cmtel8zyf005jv330jl2xrpoa	0	\N	\N	2026-08-29 16:21:56.12
cmtel901b0064v3307ggphknh	cmsx5rf2i005cv3uwk782tbox	-1	491	SALE	Order	cmtel900y005zv330k20dvb7r	0	\N	\N	2026-08-29 16:21:56.208
cmtel903q006kv33047avw79b	cmsx5rf2i005cv3uwk782tbox	-1	490	SALE	Order	cmtel903c006fv330zfsmztdg	0	\N	\N	2026-08-29 16:21:56.294
cmtel906t0070v3300mcneamp	cmsx5rf2i005cv3uwk782tbox	-1	489	SALE	Order	cmtel9069006vv330kc0fqm6j	0	\N	\N	2026-08-29 16:21:56.406
cmtel90lz008cv330lk65fbec	cmsx5rf2m005ev3uwckqmzj7j	-1	19	SALE	Order	cmtel90kg0087v3302v62fhlx	0	\N	\N	2026-08-29 16:21:56.952
cmtel90uw008ov330a930s7g8	cmsx5rf2r005gv3uwlr9kwh43	-1	14	SALE	Order	cmtel90u1008jv3301ub34bwp	0	\N	\N	2026-08-29 16:21:57.272
cmtel90wj0090v330fpjt2dia	cmsx5rf2i005cv3uwk782tbox	-1	488	SALE	Order	cmtel90vk008vv3302pf8trji	0	\N	\N	2026-08-29 16:21:57.331
cmtel90yc009cv330szxf3k57	cmsx5rexv004iv3uwhtv4yelr	-1	198	SALE	Order	cmtel90x90097v330syl1anrl	0	\N	\N	2026-08-29 16:21:57.397
cmtel90zz009ov330i4wl6hbq	cmsx5rf1f0052v3uwsuv23wed	-1	17	SALE	Order	cmtel90z3009jv330fxn0i2c6	0	\N	\N	2026-08-29 16:21:57.456
cmtel911k00a0v330th6vzaa1	cmsx5rf09004sv3uwcpkuuky5	-1	39	SALE	Order	cmtel910n009vv3304ipj7lhx	0	\N	\N	2026-08-29 16:21:57.512
cmtel915t00akv330c9xv12o8	cmsx5rfcw007kv3uwmbuiq6zn	-1	0	SALE	Order	cmtel915800afv330dmykrab7	0	\N	\N	2026-08-29 16:21:57.666
cmtel91d700bev330h867nssl	cmsx5rexv004iv3uwhtv4yelr	-1	197	SALE	Order	cmtel91cj00b8v3308tl2ih9l	0	\N	\N	2026-08-29 16:21:57.931
cmtel91di00biv330ixue4g4o	cmsx5rf09004sv3uwcpkuuky5	-1	38	SALE	Order	cmtel91cj00b8v3308tl2ih9l	0	\N	\N	2026-08-29 16:21:57.942
cmtel91ei00bvv330zimwd31y	cmsx5rexv004iv3uwhtv4yelr	-1	196	SALE	Order	cmtel91dy00bpv3306kwqzaeo	0	\N	\N	2026-08-29 16:21:57.979
cmtel91et00bzv330rioj460l	cmsx5rf09004sv3uwcpkuuky5	-1	37	SALE	Order	cmtel91dy00bpv3306kwqzaeo	0	\N	\N	2026-08-29 16:21:57.99
cmtel91wm00cfv330f33b4c4g	cmsx5rexv004iv3uwhtv4yelr	-1	195	SALE	Order	cmtel91w300cav330lc03jle1	0	\N	\N	2026-08-29 16:21:58.63
cmtel920800cvv330jd9s0ggu	cmsx5rexv004iv3uwhtv4yelr	-1	194	SALE	Order	cmtel91zp00cqv330s4j0h185	0	\N	\N	2026-08-29 16:21:58.761
cmtel92kp00dlv3308hfyzf1j	cmsx5rf2i005cv3uwk782tbox	-1	487	SALE	Order	cmtel92k700dgv330p5y5ga8q	0	\N	\N	2026-08-29 16:21:59.497
cmtel92ou00e5v330prza3z8h	cmsx5rf2i005cv3uwk782tbox	-1	486	SALE	Order	cmtel92od00e0v3302h2byf85	0	\N	\N	2026-08-29 16:21:59.646
cmtel92rc00emv33035uyo4ei	cmsx5rf2i005cv3uwk782tbox	-1	485	SALE	Order	cmtel92qw00ehv330y86fmywr	0	\N	\N	2026-08-29 16:21:59.737
cmtel930r00frv330nf048f3c	cmsx5rf2i005cv3uwk782tbox	-2	483	SALE	Order	cmtel930900fmv330anlzuy0y	0	\N	\N	2026-08-29 16:22:00.075
cmtel932100g0v3301l41vrgz	cmsx5rf2i005cv3uwk782tbox	2	485	CANCELLATION	Order	cmtel930900fmv330anlzuy0y	\N	\N	cmsx5rcwn0000v3uwukkiufkd	2026-08-29 16:22:00.121
cmtel934o00ggv330s50e82hb	cmsx5rf2i005cv3uwk782tbox	-1	484	SALE	Order	cmtel934800gbv33016ene9a3	0	\N	\N	2026-08-29 16:22:00.216
cmtel97u400h6v330i39vgq54	cmsx5rexv004iv3uwhtv4yelr	-1	199	SALE	Order	cmtel97sp00h1v330h0227knb	0	\N	\N	2026-08-29 16:22:06.316
cmtel986m00hqv330d3zwc788	cmsx5rf2i005cv3uwk782tbox	-1	9	SALE	Order	cmtel985t00hlv3301agp8sox	0	\N	\N	2026-08-29 16:22:06.767
cmtel9nv700myv330xt38unf7	cmsx5rf5m0066v3uwsl6l4ag9	-2	8	SALE	\N	\N	\N	\N	\N	2026-08-29 16:22:27.091
cmtel9nw100n0v33090an5tx1	cmsx5rf5m0066v3uwsl6l4ag9	2	10	COUNT	StockCount	cmtel9ntq00mev33018qyqapg	\N	\N	cmsx5rdij0001v3uw5g02vyaq	2026-08-29 16:22:27.122
\.


--
-- Data for Name: Supplier; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Supplier" (id, name, "contactName", phone, email, address, city, "paymentTerms", "leadTimeDays", notes, "isActive", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: SupplierBill; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SupplierBill" (id, "supplierId", "purchaseOrderId", reference, amount, "amountPaid", status, "issuedAt", "dueAt", "paidAt", notes, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: SupplierProduct; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SupplierProduct" (id, "supplierId", "variantId", "supplierSku", "lastCost", moq, "leadTimeDays", "isPreferred") FROM stdin;
\.


--
-- Data for Name: Tag; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Tag" (id, name, color, "createdAt") FROM stdin;
cmt3hu68w003nv3wchr34ng4m	bridal	\N	2026-08-21 22:00:57.632
\.


--
-- Data for Name: TailorProfile; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."TailorProfile" (id, "userId", "displayName", phone, specialties, "capacityPerWeek", "isActive", "createdAt", "updatedAt") FROM stdin;
cmsx5rdzi0004v3uwc73hang8	cmsx5rdyp0002v3uwz6wvwyci	Rashid Master	+923001110003	{kameez,shalwar,kurta}	25	t	2026-08-17 11:36:15.246	2026-08-17 11:36:15.246
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."User" (id, email, phone, "passwordHash", "firstName", "lastName", role, "isActive", "lastLoginAt", "createdAt", "updatedAt") FROM stdin;
cmsx5rdij0001v3uw5g02vyaq	staff@yaseen.pk	+923001110002	$2b$12$wl/T7QRUQX9pucynDhxh/.fsd0OzHnD72Y4lo0sHKIUClaNO.kmty	Sana	Iqbal	STAFF	t	\N	2026-08-17 11:36:14.635	2026-08-28 23:11:54.202
cmsx5rcwn0000v3uwukkiufkd	admin@yaseen.pk	+923001110001	$2b$12$0Uhti9B8p61Qs6qx/gEO5OPNu8fWNTxH7iqU3HiPC3LM57fD4cPMy	Store	Admin	ADMIN	t	2026-08-29 16:22:19.989	2026-08-17 11:36:13.846	2026-08-29 16:22:20
cmsx5rehl0005v3uwdwy4jud8	ayesha@example.com	+923001234567	$2b$12$tNFcvaXh5gUi0YSfQInSLOYSvI9GqrkH8eSX6B6WFSbRWEukwbNh2	Ayesha	Khan	CUSTOMER	t	2026-08-29 16:22:23.942	2026-08-17 11:36:15.897	2026-08-29 16:22:23.952
cmsx5rdyp0002v3uwz6wvwyci	tailor@yaseen.pk	+923001110003	$2b$12$E.j.XsenfOwqUbcYWe27GOzwypO9DkXVRWOSKkb3I1VJIOXiERYK2	Rashid	Master	TAILOR	t	2026-08-29 16:22:24.56	2026-08-17 11:36:15.217	2026-08-29 16:22:24.57
\.


--
-- Data for Name: UserPermission; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."UserPermission" (id, "userId", "permissionId", effect, "createdAt") FROM stdin;
\.


--
-- Data for Name: VariantSalesStat; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."VariantSalesStat" ("variantId", units30, units90, "lastSoldAt", "daysOfCover", "ageDays", "computedAt", "isDeadStock", "isSlowMover", "lastLowStockAlertAt") FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
2f8ec810-514e-4459-b26e-f1b78a4b09b6	ffbc673e1bd3be68e1d4632d2a82766496abdae7e44f748d4e6f5b4e312d0d02	2026-08-17 16:26:38.655692+05	20260816133646_init	\N	\N	2026-08-17 16:26:37.728067+05	1
dcb77420-9bfc-490a-b0e5-9ee8e353a999	01f424ca0236c150d372c9338113ab9bbd3b73b525b4e62f83317e07a4a43be9	2026-08-29 00:37:55.630812+05	20260828133632_add_variant_sales_stats	\N	\N	2026-08-29 00:37:55.613797+05	1
ba8cff16-cbc5-4c74-a457-8a0c6210cc0d	dd549733ca45b34a70a8591b0faf3cdcb75f4095525f508268dba035d32f836c	2026-08-17 16:26:38.690796+05	20260816212614_device_tokens	\N	\N	2026-08-17 16:26:38.657558+05	1
ae9297ee-195c-4cf2-93c8-5dc219dcd385	959fab1f915fb30447fb6e118e364272ee4fac97e75eb0fdb0324718dcb0f7a4	2026-08-22 02:59:00.974667+05	20260822090000_stitching_design_system	\N	\N	2026-08-22 02:59:00.904759+05	1
92c269a7-ad8d-4475-99be-28e81aa24b50	0fc1a13d97fbe6ce9a9ad2858e5f348570c06cf7059a291025622064641207ca	2026-08-22 02:59:01.018351+05	20260822093000_cart_item_garment_type	\N	\N	2026-08-22 02:59:00.976068+05	1
3eee0a6c-3168-407f-8ca7-6867b528900a	c0a404bbcc59e07427dbf7719add05d54dbd2c5c2b2f9e53b66a958677ff2ac0	2026-08-29 00:37:55.637935+05	20260828144101_update_variant_sales_stats	\N	\N	2026-08-29 00:37:55.63228+05	1
8de4acef-ef54-414d-9084-a9524f81ddb5	8bc00339e4d281bb738b45969c43a89b42551696e6c252307da9b90a646644f4	2026-08-24 14:51:19.332678+05	20260822120000_garment_catalog_expansion	\N	\N	2026-08-24 14:51:19.24937+05	1
5d5a9e2f-9465-427c-99ec-116e06a8821e	b1988bb528355c6d9e1005a47449c688d6e817afa8eee1f5290d1990f18f1196	2026-08-24 14:51:19.358039+05	20260823090000_inventory_audit_log	\N	\N	2026-08-24 14:51:19.33349+05	1
bb331747-c9ff-4334-90c7-8f4ae7140740	882c5da49f30377aa7aafdb7ee02266c3b4f466655fcc29221e878e639074d95	2026-08-24 14:51:19.377147+05	20260823120000_visitor_tracking	\N	\N	2026-08-24 14:51:19.359055+05	1
25ef5cf7-e909-4894-98ea-eb9bb271138f	4c08fe67334be5bd9ac17a8b5d778f625474f9beb45c80a932f9ff5e2ed50f2a	2026-08-29 00:37:55.681904+05	20260828171718_add_stock_counts	\N	\N	2026-08-29 00:37:55.639848+05	1
66f27b8b-097d-484a-b46a-8aeffbf9e2bb	5a2ef52712d7154310be7f20c743127bbad5e8f062235c4d58ff6624dc5a259c	2026-08-29 00:37:55.354985+05	20260824161517_pbac_permissions	\N	\N	2026-08-29 00:37:55.277547+05	1
b146a118-f1e6-452b-99e4-7b7c620d20d2	34bdc11332f2fc13c4cf5426928b48dfc7b198f25ec0428400bf0d64a2efbe93	2026-08-29 00:37:55.399838+05	20260824165553_user_permission_overrides	\N	\N	2026-08-29 00:37:55.357069+05	1
16a15609-7a54-40ec-b824-31195fbfc53e	97af3f7dc89f053af488c75d1a668fbd2f0f0b048f3b0094db25bcc633cf7dab	2026-08-29 00:37:55.44205+05	20260827170000_add_stock_movement_ledger	\N	\N	2026-08-29 00:37:55.401086+05	1
19bc0898-479a-4938-89f0-cfc668967ef3	5071fc2b30884b97c48032bc5a393e523ddc76d593342142b380531c35f08cdc	2026-08-29 00:37:55.453354+05	20260828000000_add_variant_cost_and_cogs	\N	\N	2026-08-29 00:37:55.443285+05	1
133f89b7-f6dc-458d-b2cf-36034255017e	f3f52ce4d7992fb3f0fdb2fac535ab9253391b6d6d842c99871b21a26fc3aa20	2026-08-29 00:37:55.491676+05	20260828034722_add_suppliers	\N	\N	2026-08-29 00:37:55.455028+05	1
be359f61-4d1a-4e3f-bbaa-5f25dafa6b1f	d213ce51cdd46f5a95c9c5373bd94d957549f031253d068ddb344eec375e7b48	2026-08-29 00:37:55.612517+05	20260828100800_add_purchase_orders	\N	\N	2026-08-29 00:37:55.493518+05	1
\.


--
-- Name: Address Address_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Address"
    ADD CONSTRAINT "Address_pkey" PRIMARY KEY (id);


--
-- Name: AnalyticsEvent AnalyticsEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AnalyticsEvent"
    ADD CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: CartItemStitchingOption CartItemStitchingOption_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CartItemStitchingOption"
    ADD CONSTRAINT "CartItemStitchingOption_pkey" PRIMARY KEY ("cartItemId", "optionId");


--
-- Name: CartItem CartItem_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CartItem"
    ADD CONSTRAINT "CartItem_pkey" PRIMARY KEY (id);


--
-- Name: Cart Cart_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Cart"
    ADD CONSTRAINT "Cart_pkey" PRIMARY KEY (id);


--
-- Name: CategoryTranslation CategoryTranslation_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CategoryTranslation"
    ADD CONSTRAINT "CategoryTranslation_pkey" PRIMARY KEY (id);


--
-- Name: Category Category_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);


--
-- Name: ContactTag ContactTag_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ContactTag"
    ADD CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("contactId", "tagId");


--
-- Name: Contact Contact_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_pkey" PRIMARY KEY (id);


--
-- Name: DeviceToken DeviceToken_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."DeviceToken"
    ADD CONSTRAINT "DeviceToken_pkey" PRIMARY KEY (id);


--
-- Name: FollowUpTask FollowUpTask_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."FollowUpTask"
    ADD CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY (id);


--
-- Name: GarmentSizeChart GarmentSizeChart_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GarmentSizeChart"
    ADD CONSTRAINT "GarmentSizeChart_pkey" PRIMARY KEY (id);


--
-- Name: GarmentType GarmentType_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GarmentType"
    ADD CONSTRAINT "GarmentType_pkey" PRIMARY KEY (id);


--
-- Name: GoodsReceiptItem GoodsReceiptItem_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GoodsReceiptItem"
    ADD CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY (id);


--
-- Name: GoodsReceipt GoodsReceipt_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GoodsReceipt"
    ADD CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY (id);


--
-- Name: Interaction Interaction_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Interaction"
    ADD CONSTRAINT "Interaction_pkey" PRIMARY KEY (id);


--
-- Name: Lead Lead_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_pkey" PRIMARY KEY (id);


--
-- Name: MeasurementField MeasurementField_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MeasurementField"
    ADD CONSTRAINT "MeasurementField_pkey" PRIMARY KEY (id);


--
-- Name: MeasurementProfile MeasurementProfile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MeasurementProfile"
    ADD CONSTRAINT "MeasurementProfile_pkey" PRIMARY KEY (id);


--
-- Name: OrderItem OrderItem_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_pkey" PRIMARY KEY (id);


--
-- Name: OrderStatusEvent OrderStatusEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderStatusEvent"
    ADD CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY (id);


--
-- Name: Order Order_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_pkey" PRIMARY KEY (id);


--
-- Name: OutboxEvent OutboxEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OutboxEvent"
    ADD CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY (id);


--
-- Name: Payment Payment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_pkey" PRIMARY KEY (id);


--
-- Name: Permission Permission_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Permission"
    ADD CONSTRAINT "Permission_pkey" PRIMARY KEY (id);


--
-- Name: ProductGarmentType ProductGarmentType_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductGarmentType"
    ADD CONSTRAINT "ProductGarmentType_pkey" PRIMARY KEY ("productId", "garmentTypeId");


--
-- Name: ProductImage ProductImage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductImage"
    ADD CONSTRAINT "ProductImage_pkey" PRIMARY KEY (id);


--
-- Name: ProductTranslation ProductTranslation_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductTranslation"
    ADD CONSTRAINT "ProductTranslation_pkey" PRIMARY KEY (id);


--
-- Name: ProductVariant ProductVariant_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductVariant"
    ADD CONSTRAINT "ProductVariant_pkey" PRIMARY KEY (id);


--
-- Name: Product Product_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);


--
-- Name: PurchaseOrderItem PurchaseOrderItem_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PurchaseOrderItem"
    ADD CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY (id);


--
-- Name: PurchaseOrder PurchaseOrder_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY (id);


--
-- Name: RefreshToken RefreshToken_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "RefreshToken_pkey" PRIMARY KEY (id);


--
-- Name: RolePermission RolePermission_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."RolePermission"
    ADD CONSTRAINT "RolePermission_pkey" PRIMARY KEY (id);


--
-- Name: Segment Segment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Segment"
    ADD CONSTRAINT "Segment_pkey" PRIMARY KEY (id);


--
-- Name: Setting Setting_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Setting"
    ADD CONSTRAINT "Setting_pkey" PRIMARY KEY (key);


--
-- Name: Shipment Shipment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Shipment"
    ADD CONSTRAINT "Shipment_pkey" PRIMARY KEY (id);


--
-- Name: StitchingJobEvent StitchingJobEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingJobEvent"
    ADD CONSTRAINT "StitchingJobEvent_pkey" PRIMARY KEY (id);


--
-- Name: StitchingJob StitchingJob_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingJob"
    ADD CONSTRAINT "StitchingJob_pkey" PRIMARY KEY (id);


--
-- Name: StitchingOptionGroup StitchingOptionGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingOptionGroup"
    ADD CONSTRAINT "StitchingOptionGroup_pkey" PRIMARY KEY (id);


--
-- Name: StitchingOption StitchingOption_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingOption"
    ADD CONSTRAINT "StitchingOption_pkey" PRIMARY KEY (id);


--
-- Name: StitchingOrder StitchingOrder_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingOrder"
    ADD CONSTRAINT "StitchingOrder_pkey" PRIMARY KEY (id);


--
-- Name: StockAdjustment StockAdjustment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StockAdjustment"
    ADD CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY (id);


--
-- Name: StockCountLine StockCountLine_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StockCountLine"
    ADD CONSTRAINT "StockCountLine_pkey" PRIMARY KEY (id);


--
-- Name: StockCount StockCount_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StockCount"
    ADD CONSTRAINT "StockCount_pkey" PRIMARY KEY (id);


--
-- Name: StockMovement StockMovement_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StockMovement"
    ADD CONSTRAINT "StockMovement_pkey" PRIMARY KEY (id);


--
-- Name: SupplierBill SupplierBill_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SupplierBill"
    ADD CONSTRAINT "SupplierBill_pkey" PRIMARY KEY (id);


--
-- Name: SupplierProduct SupplierProduct_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SupplierProduct"
    ADD CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY (id);


--
-- Name: Supplier Supplier_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Supplier"
    ADD CONSTRAINT "Supplier_pkey" PRIMARY KEY (id);


--
-- Name: Tag Tag_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Tag"
    ADD CONSTRAINT "Tag_pkey" PRIMARY KEY (id);


--
-- Name: TailorProfile TailorProfile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TailorProfile"
    ADD CONSTRAINT "TailorProfile_pkey" PRIMARY KEY (id);


--
-- Name: UserPermission UserPermission_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UserPermission"
    ADD CONSTRAINT "UserPermission_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: VariantSalesStat VariantSalesStat_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."VariantSalesStat"
    ADD CONSTRAINT "VariantSalesStat_pkey" PRIMARY KEY ("variantId");


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Address_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Address_userId_idx" ON public."Address" USING btree ("userId");


--
-- Name: AnalyticsEvent_sessionId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AnalyticsEvent_sessionId_createdAt_idx" ON public."AnalyticsEvent" USING btree ("sessionId", "createdAt");


--
-- Name: AnalyticsEvent_type_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AnalyticsEvent_type_createdAt_idx" ON public."AnalyticsEvent" USING btree (type, "createdAt");


--
-- Name: AuditLog_actorId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AuditLog_actorId_idx" ON public."AuditLog" USING btree ("actorId");


--
-- Name: AuditLog_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AuditLog_createdAt_idx" ON public."AuditLog" USING btree ("createdAt");


--
-- Name: AuditLog_entity_entityId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AuditLog_entity_entityId_idx" ON public."AuditLog" USING btree (entity, "entityId");


--
-- Name: CartItem_cartId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "CartItem_cartId_idx" ON public."CartItem" USING btree ("cartId");


--
-- Name: Cart_expiresAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Cart_expiresAt_idx" ON public."Cart" USING btree ("expiresAt");


--
-- Name: Cart_token_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Cart_token_key" ON public."Cart" USING btree (token);


--
-- Name: Cart_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Cart_userId_idx" ON public."Cart" USING btree ("userId");


--
-- Name: CategoryTranslation_categoryId_locale_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "CategoryTranslation_categoryId_locale_key" ON public."CategoryTranslation" USING btree ("categoryId", locale);


--
-- Name: Category_isActive_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Category_isActive_idx" ON public."Category" USING btree ("isActive");


--
-- Name: Category_parentId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Category_parentId_idx" ON public."Category" USING btree ("parentId");


--
-- Name: Category_slug_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Category_slug_key" ON public."Category" USING btree (slug);


--
-- Name: Contact_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Contact_email_key" ON public."Contact" USING btree (email);


--
-- Name: Contact_lastOrderAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Contact_lastOrderAt_idx" ON public."Contact" USING btree ("lastOrderAt");


--
-- Name: Contact_lifetimeValue_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Contact_lifetimeValue_idx" ON public."Contact" USING btree ("lifetimeValue");


--
-- Name: Contact_ownerId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Contact_ownerId_idx" ON public."Contact" USING btree ("ownerId");


--
-- Name: Contact_phoneE164_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Contact_phoneE164_key" ON public."Contact" USING btree ("phoneE164");


--
-- Name: Contact_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Contact_status_idx" ON public."Contact" USING btree (status);


--
-- Name: Contact_userId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Contact_userId_key" ON public."Contact" USING btree ("userId");


--
-- Name: DeviceToken_token_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "DeviceToken_token_key" ON public."DeviceToken" USING btree (token);


--
-- Name: DeviceToken_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "DeviceToken_userId_idx" ON public."DeviceToken" USING btree ("userId");


--
-- Name: FollowUpTask_assigneeId_isDone_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "FollowUpTask_assigneeId_isDone_idx" ON public."FollowUpTask" USING btree ("assigneeId", "isDone");


--
-- Name: FollowUpTask_isDone_dueAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "FollowUpTask_isDone_dueAt_idx" ON public."FollowUpTask" USING btree ("isDone", "dueAt");


--
-- Name: GarmentSizeChart_garmentTypeId_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "GarmentSizeChart_garmentTypeId_order_idx" ON public."GarmentSizeChart" USING btree ("garmentTypeId", "order");


--
-- Name: GarmentSizeChart_garmentTypeId_sizeToken_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "GarmentSizeChart_garmentTypeId_sizeToken_key" ON public."GarmentSizeChart" USING btree ("garmentTypeId", "sizeToken");


--
-- Name: GarmentType_isActive_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "GarmentType_isActive_order_idx" ON public."GarmentType" USING btree ("isActive", "order");


--
-- Name: GarmentType_key_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "GarmentType_key_key" ON public."GarmentType" USING btree (key);


--
-- Name: GoodsReceiptItem_goodsReceiptId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "GoodsReceiptItem_goodsReceiptId_idx" ON public."GoodsReceiptItem" USING btree ("goodsReceiptId");


--
-- Name: GoodsReceiptItem_variantId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "GoodsReceiptItem_variantId_idx" ON public."GoodsReceiptItem" USING btree ("variantId");


--
-- Name: GoodsReceipt_number_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "GoodsReceipt_number_key" ON public."GoodsReceipt" USING btree (number);


--
-- Name: GoodsReceipt_purchaseOrderId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "GoodsReceipt_purchaseOrderId_idx" ON public."GoodsReceipt" USING btree ("purchaseOrderId");


--
-- Name: Interaction_contactId_occurredAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Interaction_contactId_occurredAt_idx" ON public."Interaction" USING btree ("contactId", "occurredAt");


--
-- Name: Interaction_leadId_occurredAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Interaction_leadId_occurredAt_idx" ON public."Interaction" USING btree ("leadId", "occurredAt");


--
-- Name: Lead_contactId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Lead_contactId_idx" ON public."Lead" USING btree ("contactId");


--
-- Name: Lead_ownerId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Lead_ownerId_idx" ON public."Lead" USING btree ("ownerId");


--
-- Name: Lead_status_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Lead_status_createdAt_idx" ON public."Lead" USING btree (status, "createdAt");


--
-- Name: MeasurementField_garmentTypeId_key_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "MeasurementField_garmentTypeId_key_key" ON public."MeasurementField" USING btree ("garmentTypeId", key);


--
-- Name: MeasurementField_garmentTypeId_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "MeasurementField_garmentTypeId_order_idx" ON public."MeasurementField" USING btree ("garmentTypeId", "order");


--
-- Name: MeasurementProfile_userId_garmentTypeId_label_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "MeasurementProfile_userId_garmentTypeId_label_key" ON public."MeasurementProfile" USING btree ("userId", "garmentTypeId", label);


--
-- Name: MeasurementProfile_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "MeasurementProfile_userId_idx" ON public."MeasurementProfile" USING btree ("userId");


--
-- Name: OrderItem_orderId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "OrderItem_orderId_idx" ON public."OrderItem" USING btree ("orderId");


--
-- Name: OrderItem_productId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "OrderItem_productId_idx" ON public."OrderItem" USING btree ("productId");


--
-- Name: OrderStatusEvent_orderId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "OrderStatusEvent_orderId_createdAt_idx" ON public."OrderStatusEvent" USING btree ("orderId", "createdAt");


--
-- Name: Order_contactId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Order_contactId_idx" ON public."Order" USING btree ("contactId");


--
-- Name: Order_guestPhone_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Order_guestPhone_idx" ON public."Order" USING btree ("guestPhone");


--
-- Name: Order_number_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Order_number_key" ON public."Order" USING btree (number);


--
-- Name: Order_status_placedAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Order_status_placedAt_idx" ON public."Order" USING btree (status, "placedAt");


--
-- Name: Order_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Order_userId_idx" ON public."Order" USING btree ("userId");


--
-- Name: OutboxEvent_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "OutboxEvent_name_idx" ON public."OutboxEvent" USING btree (name);


--
-- Name: OutboxEvent_status_availableAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "OutboxEvent_status_availableAt_idx" ON public."OutboxEvent" USING btree (status, "availableAt");


--
-- Name: Payment_orderId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Payment_orderId_idx" ON public."Payment" USING btree ("orderId");


--
-- Name: Payment_provider_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Payment_provider_status_idx" ON public."Payment" USING btree (provider, status);


--
-- Name: Payment_reference_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Payment_reference_key" ON public."Payment" USING btree (reference);


--
-- Name: Payment_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Payment_status_idx" ON public."Payment" USING btree (status);


--
-- Name: Permission_key_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Permission_key_key" ON public."Permission" USING btree (key);


--
-- Name: ProductImage_productId_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ProductImage_productId_order_idx" ON public."ProductImage" USING btree ("productId", "order");


--
-- Name: ProductTranslation_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ProductTranslation_name_idx" ON public."ProductTranslation" USING btree (name);


--
-- Name: ProductTranslation_productId_locale_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ProductTranslation_productId_locale_key" ON public."ProductTranslation" USING btree ("productId", locale);


--
-- Name: ProductVariant_barcode_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ProductVariant_barcode_key" ON public."ProductVariant" USING btree (barcode);


--
-- Name: ProductVariant_productId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ProductVariant_productId_idx" ON public."ProductVariant" USING btree ("productId");


--
-- Name: ProductVariant_sku_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ProductVariant_sku_key" ON public."ProductVariant" USING btree (sku);


--
-- Name: ProductVariant_stock_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ProductVariant_stock_idx" ON public."ProductVariant" USING btree (stock);


--
-- Name: Product_categoryId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_categoryId_idx" ON public."Product" USING btree ("categoryId");


--
-- Name: Product_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_createdAt_idx" ON public."Product" USING btree ("createdAt");


--
-- Name: Product_featuredRank_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_featuredRank_idx" ON public."Product" USING btree ("featuredRank");


--
-- Name: Product_slug_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Product_slug_key" ON public."Product" USING btree (slug);


--
-- Name: Product_status_kind_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_status_kind_idx" ON public."Product" USING btree (status, kind);


--
-- Name: PurchaseOrderItem_purchaseOrderId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON public."PurchaseOrderItem" USING btree ("purchaseOrderId");


--
-- Name: PurchaseOrderItem_variantId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "PurchaseOrderItem_variantId_idx" ON public."PurchaseOrderItem" USING btree ("variantId");


--
-- Name: PurchaseOrder_number_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON public."PurchaseOrder" USING btree (number);


--
-- Name: PurchaseOrder_status_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "PurchaseOrder_status_createdAt_idx" ON public."PurchaseOrder" USING btree (status, "createdAt");


--
-- Name: PurchaseOrder_supplierId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "PurchaseOrder_supplierId_idx" ON public."PurchaseOrder" USING btree ("supplierId");


--
-- Name: RefreshToken_expiresAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "RefreshToken_expiresAt_idx" ON public."RefreshToken" USING btree ("expiresAt");


--
-- Name: RefreshToken_tokenHash_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON public."RefreshToken" USING btree ("tokenHash");


--
-- Name: RefreshToken_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "RefreshToken_userId_idx" ON public."RefreshToken" USING btree ("userId");


--
-- Name: RolePermission_role_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "RolePermission_role_idx" ON public."RolePermission" USING btree (role);


--
-- Name: RolePermission_role_permissionId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "RolePermission_role_permissionId_key" ON public."RolePermission" USING btree (role, "permissionId");


--
-- Name: Segment_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Segment_name_key" ON public."Segment" USING btree (name);


--
-- Name: Shipment_orderId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Shipment_orderId_idx" ON public."Shipment" USING btree ("orderId");


--
-- Name: Shipment_trackingNumber_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Shipment_trackingNumber_idx" ON public."Shipment" USING btree ("trackingNumber");


--
-- Name: StitchingJobEvent_jobId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StitchingJobEvent_jobId_createdAt_idx" ON public."StitchingJobEvent" USING btree ("jobId", "createdAt");


--
-- Name: StitchingJob_assignedTailorId_stage_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StitchingJob_assignedTailorId_stage_idx" ON public."StitchingJob" USING btree ("assignedTailorId", stage);


--
-- Name: StitchingJob_number_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "StitchingJob_number_key" ON public."StitchingJob" USING btree (number);


--
-- Name: StitchingJob_orderItemId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "StitchingJob_orderItemId_key" ON public."StitchingJob" USING btree ("orderItemId");


--
-- Name: StitchingJob_stage_dueAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StitchingJob_stage_dueAt_idx" ON public."StitchingJob" USING btree (stage, "dueAt");


--
-- Name: StitchingJob_stitchingOrderId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StitchingJob_stitchingOrderId_idx" ON public."StitchingJob" USING btree ("stitchingOrderId");


--
-- Name: StitchingOptionGroup_area_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StitchingOptionGroup_area_order_idx" ON public."StitchingOptionGroup" USING btree (area, "order");


--
-- Name: StitchingOptionGroup_garmentTypeId_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StitchingOptionGroup_garmentTypeId_order_idx" ON public."StitchingOptionGroup" USING btree ("garmentTypeId", "order");


--
-- Name: StitchingOptionGroup_key_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "StitchingOptionGroup_key_key" ON public."StitchingOptionGroup" USING btree (key);


--
-- Name: StitchingOption_groupId_key_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "StitchingOption_groupId_key_key" ON public."StitchingOption" USING btree ("groupId", key);


--
-- Name: StitchingOption_groupId_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StitchingOption_groupId_order_idx" ON public."StitchingOption" USING btree ("groupId", "order");


--
-- Name: StitchingOrder_contactId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StitchingOrder_contactId_idx" ON public."StitchingOrder" USING btree ("contactId");


--
-- Name: StitchingOrder_number_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "StitchingOrder_number_key" ON public."StitchingOrder" USING btree (number);


--
-- Name: StitchingOrder_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StitchingOrder_status_idx" ON public."StitchingOrder" USING btree (status);


--
-- Name: StitchingOrder_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StitchingOrder_userId_idx" ON public."StitchingOrder" USING btree ("userId");


--
-- Name: StockAdjustment_variantId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StockAdjustment_variantId_createdAt_idx" ON public."StockAdjustment" USING btree ("variantId", "createdAt");


--
-- Name: StockCountLine_stockCountId_variantId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "StockCountLine_stockCountId_variantId_key" ON public."StockCountLine" USING btree ("stockCountId", "variantId");


--
-- Name: StockCount_countNumber_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "StockCount_countNumber_key" ON public."StockCount" USING btree ("countNumber");


--
-- Name: StockCount_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StockCount_status_idx" ON public."StockCount" USING btree (status);


--
-- Name: StockMovement_reason_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StockMovement_reason_createdAt_idx" ON public."StockMovement" USING btree (reason, "createdAt");


--
-- Name: StockMovement_refType_refId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StockMovement_refType_refId_idx" ON public."StockMovement" USING btree ("refType", "refId");


--
-- Name: StockMovement_variantId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "StockMovement_variantId_createdAt_idx" ON public."StockMovement" USING btree ("variantId", "createdAt");


--
-- Name: SupplierBill_status_dueAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "SupplierBill_status_dueAt_idx" ON public."SupplierBill" USING btree (status, "dueAt");


--
-- Name: SupplierBill_supplierId_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "SupplierBill_supplierId_status_idx" ON public."SupplierBill" USING btree ("supplierId", status);


--
-- Name: SupplierProduct_supplierId_variantId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "SupplierProduct_supplierId_variantId_key" ON public."SupplierProduct" USING btree ("supplierId", "variantId");


--
-- Name: SupplierProduct_variantId_isPreferred_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "SupplierProduct_variantId_isPreferred_idx" ON public."SupplierProduct" USING btree ("variantId", "isPreferred");


--
-- Name: Supplier_isActive_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Supplier_isActive_name_idx" ON public."Supplier" USING btree ("isActive", name);


--
-- Name: Tag_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Tag_name_key" ON public."Tag" USING btree (name);


--
-- Name: TailorProfile_userId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "TailorProfile_userId_key" ON public."TailorProfile" USING btree ("userId");


--
-- Name: UserPermission_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "UserPermission_userId_idx" ON public."UserPermission" USING btree ("userId");


--
-- Name: UserPermission_userId_permissionId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "UserPermission_userId_permissionId_key" ON public."UserPermission" USING btree ("userId", "permissionId");


--
-- Name: User_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "User_createdAt_idx" ON public."User" USING btree ("createdAt");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_phone_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_phone_key" ON public."User" USING btree (phone);


--
-- Name: User_role_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "User_role_idx" ON public."User" USING btree (role);


--
-- Name: Address Address_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Address"
    ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AuditLog AuditLog_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CartItemStitchingOption CartItemStitchingOption_cartItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CartItemStitchingOption"
    ADD CONSTRAINT "CartItemStitchingOption_cartItemId_fkey" FOREIGN KEY ("cartItemId") REFERENCES public."CartItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CartItemStitchingOption CartItemStitchingOption_optionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CartItemStitchingOption"
    ADD CONSTRAINT "CartItemStitchingOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES public."StitchingOption"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CartItem CartItem_cartId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CartItem"
    ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES public."Cart"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CartItem CartItem_garmentTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CartItem"
    ADD CONSTRAINT "CartItem_garmentTypeId_fkey" FOREIGN KEY ("garmentTypeId") REFERENCES public."GarmentType"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CartItem CartItem_measurementProfileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CartItem"
    ADD CONSTRAINT "CartItem_measurementProfileId_fkey" FOREIGN KEY ("measurementProfileId") REFERENCES public."MeasurementProfile"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CartItem CartItem_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CartItem"
    ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CartItem CartItem_stitchingServiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CartItem"
    ADD CONSTRAINT "CartItem_stitchingServiceId_fkey" FOREIGN KEY ("stitchingServiceId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CartItem CartItem_variantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CartItem"
    ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Cart Cart_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Cart"
    ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CategoryTranslation CategoryTranslation_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CategoryTranslation"
    ADD CONSTRAINT "CategoryTranslation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Category Category_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ContactTag ContactTag_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ContactTag"
    ADD CONSTRAINT "ContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ContactTag ContactTag_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ContactTag"
    ADD CONSTRAINT "ContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public."Tag"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Contact Contact_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Contact Contact_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: DeviceToken DeviceToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."DeviceToken"
    ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FollowUpTask FollowUpTask_assigneeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."FollowUpTask"
    ADD CONSTRAINT "FollowUpTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: FollowUpTask FollowUpTask_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."FollowUpTask"
    ADD CONSTRAINT "FollowUpTask_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FollowUpTask FollowUpTask_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."FollowUpTask"
    ADD CONSTRAINT "FollowUpTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GarmentSizeChart GarmentSizeChart_garmentTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GarmentSizeChart"
    ADD CONSTRAINT "GarmentSizeChart_garmentTypeId_fkey" FOREIGN KEY ("garmentTypeId") REFERENCES public."GarmentType"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GoodsReceiptItem GoodsReceiptItem_goodsReceiptId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GoodsReceiptItem"
    ADD CONSTRAINT "GoodsReceiptItem_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES public."GoodsReceipt"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GoodsReceiptItem GoodsReceiptItem_purchaseOrderItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GoodsReceiptItem"
    ADD CONSTRAINT "GoodsReceiptItem_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES public."PurchaseOrderItem"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: GoodsReceiptItem GoodsReceiptItem_variantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GoodsReceiptItem"
    ADD CONSTRAINT "GoodsReceiptItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: GoodsReceipt GoodsReceipt_purchaseOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GoodsReceipt"
    ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES public."PurchaseOrder"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: GoodsReceipt GoodsReceipt_receivedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GoodsReceipt"
    ADD CONSTRAINT "GoodsReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Interaction Interaction_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Interaction"
    ADD CONSTRAINT "Interaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Interaction Interaction_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Interaction"
    ADD CONSTRAINT "Interaction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Interaction Interaction_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Interaction"
    ADD CONSTRAINT "Interaction_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Lead Lead_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Lead Lead_convertedOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Lead Lead_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: MeasurementField MeasurementField_garmentTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MeasurementField"
    ADD CONSTRAINT "MeasurementField_garmentTypeId_fkey" FOREIGN KEY ("garmentTypeId") REFERENCES public."GarmentType"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MeasurementProfile MeasurementProfile_garmentTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MeasurementProfile"
    ADD CONSTRAINT "MeasurementProfile_garmentTypeId_fkey" FOREIGN KEY ("garmentTypeId") REFERENCES public."GarmentType"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MeasurementProfile MeasurementProfile_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MeasurementProfile"
    ADD CONSTRAINT "MeasurementProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OrderItem OrderItem_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OrderItem OrderItem_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OrderItem OrderItem_stitchingServiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_stitchingServiceId_fkey" FOREIGN KEY ("stitchingServiceId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OrderItem OrderItem_variantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OrderStatusEvent OrderStatusEvent_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderStatusEvent"
    ADD CONSTRAINT "OrderStatusEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OrderStatusEvent OrderStatusEvent_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderStatusEvent"
    ADD CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Order Order_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Order Order_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Payment Payment_approvedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Payment Payment_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProductGarmentType ProductGarmentType_garmentTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductGarmentType"
    ADD CONSTRAINT "ProductGarmentType_garmentTypeId_fkey" FOREIGN KEY ("garmentTypeId") REFERENCES public."GarmentType"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProductGarmentType ProductGarmentType_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductGarmentType"
    ADD CONSTRAINT "ProductGarmentType_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProductImage ProductImage_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductImage"
    ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProductImage ProductImage_variantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductImage"
    ADD CONSTRAINT "ProductImage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProductTranslation ProductTranslation_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductTranslation"
    ADD CONSTRAINT "ProductTranslation_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ProductVariant ProductVariant_preferredSupplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductVariant"
    ADD CONSTRAINT "ProductVariant_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ProductVariant ProductVariant_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductVariant"
    ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Product Product_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Product Product_garmentTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_garmentTypeId_fkey" FOREIGN KEY ("garmentTypeId") REFERENCES public."GarmentType"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PurchaseOrderItem PurchaseOrderItem_purchaseOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PurchaseOrderItem"
    ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES public."PurchaseOrder"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PurchaseOrderItem PurchaseOrderItem_variantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PurchaseOrderItem"
    ADD CONSTRAINT "PurchaseOrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PurchaseOrder PurchaseOrder_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PurchaseOrder PurchaseOrder_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RefreshToken RefreshToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: RolePermission RolePermission_permissionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."RolePermission"
    ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES public."Permission"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Segment Segment_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Segment"
    ADD CONSTRAINT "Segment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Shipment Shipment_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Shipment"
    ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: StitchingJobEvent StitchingJobEvent_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingJobEvent"
    ADD CONSTRAINT "StitchingJobEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StitchingJobEvent StitchingJobEvent_jobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingJobEvent"
    ADD CONSTRAINT "StitchingJobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES public."StitchingJob"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: StitchingJob StitchingJob_assignedTailorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingJob"
    ADD CONSTRAINT "StitchingJob_assignedTailorId_fkey" FOREIGN KEY ("assignedTailorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StitchingJob StitchingJob_garmentTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingJob"
    ADD CONSTRAINT "StitchingJob_garmentTypeId_fkey" FOREIGN KEY ("garmentTypeId") REFERENCES public."GarmentType"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: StitchingJob StitchingJob_orderItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingJob"
    ADD CONSTRAINT "StitchingJob_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES public."OrderItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: StitchingJob StitchingJob_stitchingOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingJob"
    ADD CONSTRAINT "StitchingJob_stitchingOrderId_fkey" FOREIGN KEY ("stitchingOrderId") REFERENCES public."StitchingOrder"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: StitchingOptionGroup StitchingOptionGroup_garmentTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingOptionGroup"
    ADD CONSTRAINT "StitchingOptionGroup_garmentTypeId_fkey" FOREIGN KEY ("garmentTypeId") REFERENCES public."GarmentType"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: StitchingOption StitchingOption_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingOption"
    ADD CONSTRAINT "StitchingOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public."StitchingOptionGroup"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: StitchingOrder StitchingOrder_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingOrder"
    ADD CONSTRAINT "StitchingOrder_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StitchingOrder StitchingOrder_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StitchingOrder"
    ADD CONSTRAINT "StitchingOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StockAdjustment StockAdjustment_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StockAdjustment"
    ADD CONSTRAINT "StockAdjustment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StockAdjustment StockAdjustment_variantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StockAdjustment"
    ADD CONSTRAINT "StockAdjustment_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: StockCountLine StockCountLine_stockCountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StockCountLine"
    ADD CONSTRAINT "StockCountLine_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES public."StockCount"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: StockCountLine StockCountLine_variantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StockCountLine"
    ADD CONSTRAINT "StockCountLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: StockCount StockCount_assignedTo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StockCount"
    ADD CONSTRAINT "StockCount_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StockCount StockCount_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StockCount"
    ADD CONSTRAINT "StockCount_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StockMovement StockMovement_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StockMovement"
    ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: StockMovement StockMovement_variantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."StockMovement"
    ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SupplierBill SupplierBill_purchaseOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SupplierBill"
    ADD CONSTRAINT "SupplierBill_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES public."PurchaseOrder"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SupplierBill SupplierBill_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SupplierBill"
    ADD CONSTRAINT "SupplierBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SupplierProduct SupplierProduct_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SupplierProduct"
    ADD CONSTRAINT "SupplierProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SupplierProduct SupplierProduct_variantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SupplierProduct"
    ADD CONSTRAINT "SupplierProduct_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: TailorProfile TailorProfile_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TailorProfile"
    ADD CONSTRAINT "TailorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserPermission UserPermission_permissionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UserPermission"
    ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES public."Permission"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserPermission UserPermission_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UserPermission"
    ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: VariantSalesStat VariantSalesStat_variantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."VariantSalesStat"
    ADD CONSTRAINT "VariantSalesStat_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Aml4O1evHcCQXqJCem7OFOC9BfgtaFLoMPIOlj8HOvbmyaRPIpYJnnSBPoZKWom

