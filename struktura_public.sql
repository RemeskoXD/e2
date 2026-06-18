--
-- PostgreSQL database dump
--

\restrict KdGO8RnZyjpBq1oboEm0AfAgq7It3M07K6cy6fWev0YEQlVT7aGJIsprUS2w1Eo

-- Dumped from database version 18.4 (Ubuntu 18.4-1.pgdg24.04+1)
-- Dumped by pg_dump version 18.4 (Ubuntu 18.4-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: remeskodev_qapi
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO remeskodev_qapi;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: remeskodev_qapi
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Category; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Category" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    count character varying(255),
    img text
);


ALTER TABLE public."Category" OWNER TO postgres;

--
-- Name: Category_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Category_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Category_id_seq" OWNER TO postgres;

--
-- Name: Category_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Category_id_seq" OWNED BY public."Category".id;


--
-- Name: Customer; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Customer" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(50),
    orders_count integer DEFAULT 0,
    total_spent integer DEFAULT 0,
    registered timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public."Customer" OWNER TO postgres;

--
-- Name: Customer_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Customer_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Customer_id_seq" OWNER TO postgres;

--
-- Name: Customer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Customer_id_seq" OWNED BY public."Customer".id;


--
-- Name: FabricGroup; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."FabricGroup" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    surcharge numeric(10,2) DEFAULT 0 NOT NULL,
    colors jsonb DEFAULT '[]'::jsonb
);


ALTER TABLE public."FabricGroup" OWNER TO postgres;

--
-- Name: FabricGroup_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."FabricGroup_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."FabricGroup_id_seq" OWNER TO postgres;

--
-- Name: FabricGroup_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."FabricGroup_id_seq" OWNED BY public."FabricGroup".id;


--
-- Name: Image; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Image" (
    id character varying(64) NOT NULL,
    mime_type character varying(100) NOT NULL,
    data text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public."Image" OWNER TO postgres;

--
-- Name: MeasureGuidePage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."MeasureGuidePage" (
    id smallint DEFAULT 1 NOT NULL,
    eyebrow character varying(255) DEFAULT ''::character varying NOT NULL,
    title character varying(500) DEFAULT ''::character varying NOT NULL,
    intro text DEFAULT ''::text NOT NULL,
    card_title character varying(500) DEFAULT ''::character varying NOT NULL,
    card_subtitle text DEFAULT ''::text NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT measure_guide_single_row CHECK ((id = 1))
);


ALTER TABLE public."MeasureGuidePage" OWNER TO postgres;

--
-- Name: MeasureGuideSection; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."MeasureGuideSection" (
    id integer NOT NULL,
    title character varying(500) NOT NULL,
    body_html text DEFAULT ''::text NOT NULL,
    video_url text,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."MeasureGuideSection" OWNER TO postgres;

--
-- Name: MeasureGuideSection_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."MeasureGuideSection_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."MeasureGuideSection_id_seq" OWNER TO postgres;

--
-- Name: MeasureGuideSection_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."MeasureGuideSection_id_seq" OWNED BY public."MeasureGuideSection".id;


--
-- Name: Order; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Order" (
    id integer NOT NULL,
    order_no character varying(50) NOT NULL,
    date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    customer_name character varying(255) NOT NULL,
    total_amount integer,
    status character varying(50) DEFAULT 'Nová'::character varying,
    items_count integer,
    customer_email character varying(255),
    customer_phone character varying(50),
    customer_note text
);


ALTER TABLE public."Order" OWNER TO postgres;

--
-- Name: OrderItem; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."OrderItem" (
    id integer NOT NULL,
    order_id integer NOT NULL,
    product_id integer NOT NULL,
    product_title character varying(500),
    width_mm integer NOT NULL,
    height_mm integer NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price_czk integer NOT NULL,
    line_total_czk integer NOT NULL,
    options jsonb DEFAULT '{}'::jsonb
);


ALTER TABLE public."OrderItem" OWNER TO postgres;

--
-- Name: OrderItem_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."OrderItem_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."OrderItem_id_seq" OWNER TO postgres;

--
-- Name: OrderItem_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."OrderItem_id_seq" OWNED BY public."OrderItem".id;


--
-- Name: Order_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Order_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Order_id_seq" OWNER TO postgres;

--
-- Name: Order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Order_id_seq" OWNED BY public."Order".id;


--
-- Name: Product; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Product" (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    category character varying(255),
    price integer,
    "oldPrice" integer,
    badge character varying(50),
    img text,
    "desc" text,
    supplier_markup_percent numeric(6,2) DEFAULT 0 NOT NULL,
    commission_percent numeric(6,2) DEFAULT 0 NOT NULL,
    width_mm_min integer,
    width_mm_max integer,
    height_mm_min integer,
    height_mm_max integer,
    max_area_m2 numeric(6,2),
    price_mode character varying(32) DEFAULT 'matrix_cell'::character varying,
    fabric_group integer,
    validation_profile character varying(32),
    hidden boolean DEFAULT false,
    gallery jsonb DEFAULT '[]'::jsonb,
    extras jsonb DEFAULT '[]'::jsonb,
    colors jsonb DEFAULT '[]'::jsonb,
    fabric_groups_config jsonb
);


ALTER TABLE public."Product" OWNER TO postgres;

--
-- Name: ProductHeightPriceTier; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ProductHeightPriceTier" (
    id integer NOT NULL,
    product_id integer NOT NULL,
    height_mm_min integer NOT NULL,
    height_mm_max integer NOT NULL,
    price_per_m2_czk integer NOT NULL,
    sort_order integer DEFAULT 0
);


ALTER TABLE public."ProductHeightPriceTier" OWNER TO postgres;

--
-- Name: ProductHeightPriceTier_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."ProductHeightPriceTier_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."ProductHeightPriceTier_id_seq" OWNER TO postgres;

--
-- Name: ProductHeightPriceTier_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."ProductHeightPriceTier_id_seq" OWNED BY public."ProductHeightPriceTier".id;


--
-- Name: ProductPriceBracket; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ProductPriceBracket" (
    id integer NOT NULL,
    product_id integer NOT NULL,
    width_mm_max integer NOT NULL,
    height_mm_max integer NOT NULL,
    base_price_czk integer NOT NULL,
    sort_order integer DEFAULT 0
);


ALTER TABLE public."ProductPriceBracket" OWNER TO postgres;

--
-- Name: ProductPriceBracket_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."ProductPriceBracket_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."ProductPriceBracket_id_seq" OWNER TO postgres;

--
-- Name: ProductPriceBracket_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."ProductPriceBracket_id_seq" OWNED BY public."ProductPriceBracket".id;


--
-- Name: Product_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Product_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Product_id_seq" OWNER TO postgres;

--
-- Name: Product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Product_id_seq" OWNED BY public."Product".id;


--
-- Name: leads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leads (
    id integer NOT NULL,
    service text NOT NULL,
    type text NOT NULL,
    color text,
    date text NOT NULL,
    "time" text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text NOT NULL,
    address text NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.leads OWNER TO postgres;

--
-- Name: leads_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.leads_id_seq OWNER TO postgres;

--
-- Name: leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.leads_id_seq OWNED BY public.leads.id;


--
-- Name: pageviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pageviews (
    id integer NOT NULL,
    path text NOT NULL,
    ip text,
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.pageviews OWNER TO postgres;

--
-- Name: pageviews_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pageviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pageviews_id_seq OWNER TO postgres;

--
-- Name: pageviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pageviews_id_seq OWNED BY public.pageviews.id;


--
-- Name: popup_stats; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.popup_stats (
    id integer NOT NULL,
    action text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.popup_stats OWNER TO postgres;

--
-- Name: popup_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.popup_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.popup_stats_id_seq OWNER TO postgres;

--
-- Name: popup_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.popup_stats_id_seq OWNED BY public.popup_stats.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value text NOT NULL
);


ALTER TABLE public.settings OWNER TO postgres;

--
-- Name: visits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.visits (
    id integer NOT NULL,
    source text NOT NULL,
    ip text,
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.visits OWNER TO postgres;

--
-- Name: visits_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.visits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.visits_id_seq OWNER TO postgres;

--
-- Name: visits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.visits_id_seq OWNED BY public.visits.id;


--
-- Name: Category id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Category" ALTER COLUMN id SET DEFAULT nextval('public."Category_id_seq"'::regclass);


--
-- Name: Customer id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Customer" ALTER COLUMN id SET DEFAULT nextval('public."Customer_id_seq"'::regclass);


--
-- Name: FabricGroup id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."FabricGroup" ALTER COLUMN id SET DEFAULT nextval('public."FabricGroup_id_seq"'::regclass);


--
-- Name: MeasureGuideSection id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MeasureGuideSection" ALTER COLUMN id SET DEFAULT nextval('public."MeasureGuideSection_id_seq"'::regclass);


--
-- Name: Order id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order" ALTER COLUMN id SET DEFAULT nextval('public."Order_id_seq"'::regclass);


--
-- Name: OrderItem id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem" ALTER COLUMN id SET DEFAULT nextval('public."OrderItem_id_seq"'::regclass);


--
-- Name: Product id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product" ALTER COLUMN id SET DEFAULT nextval('public."Product_id_seq"'::regclass);


--
-- Name: ProductHeightPriceTier id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductHeightPriceTier" ALTER COLUMN id SET DEFAULT nextval('public."ProductHeightPriceTier_id_seq"'::regclass);


--
-- Name: ProductPriceBracket id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductPriceBracket" ALTER COLUMN id SET DEFAULT nextval('public."ProductPriceBracket_id_seq"'::regclass);


--
-- Name: leads id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leads ALTER COLUMN id SET DEFAULT nextval('public.leads_id_seq'::regclass);


--
-- Name: pageviews id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pageviews ALTER COLUMN id SET DEFAULT nextval('public.pageviews_id_seq'::regclass);


--
-- Name: popup_stats id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.popup_stats ALTER COLUMN id SET DEFAULT nextval('public.popup_stats_id_seq'::regclass);


--
-- Name: visits id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.visits ALTER COLUMN id SET DEFAULT nextval('public.visits_id_seq'::regclass);


--
-- Name: Category Category_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);


--
-- Name: Customer Customer_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_email_key" UNIQUE (email);


--
-- Name: Customer Customer_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_pkey" PRIMARY KEY (id);


--
-- Name: FabricGroup FabricGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."FabricGroup"
    ADD CONSTRAINT "FabricGroup_pkey" PRIMARY KEY (id);


--
-- Name: Image Image_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Image"
    ADD CONSTRAINT "Image_pkey" PRIMARY KEY (id);


--
-- Name: MeasureGuidePage MeasureGuidePage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MeasureGuidePage"
    ADD CONSTRAINT "MeasureGuidePage_pkey" PRIMARY KEY (id);


--
-- Name: MeasureGuideSection MeasureGuideSection_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MeasureGuideSection"
    ADD CONSTRAINT "MeasureGuideSection_pkey" PRIMARY KEY (id);


--
-- Name: OrderItem OrderItem_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_pkey" PRIMARY KEY (id);


--
-- Name: Order Order_order_no_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_order_no_key" UNIQUE (order_no);


--
-- Name: Order Order_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_pkey" PRIMARY KEY (id);


--
-- Name: ProductHeightPriceTier ProductHeightPriceTier_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductHeightPriceTier"
    ADD CONSTRAINT "ProductHeightPriceTier_pkey" PRIMARY KEY (id);


--
-- Name: ProductPriceBracket ProductPriceBracket_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductPriceBracket"
    ADD CONSTRAINT "ProductPriceBracket_pkey" PRIMARY KEY (id);


--
-- Name: Product Product_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: pageviews pageviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pageviews
    ADD CONSTRAINT pageviews_pkey PRIMARY KEY (id);


--
-- Name: popup_stats popup_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.popup_stats
    ADD CONSTRAINT popup_stats_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: visits visits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id);


--
-- Name: idx_height_price_tier_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_height_price_tier_product ON public."ProductHeightPriceTier" USING btree (product_id);


--
-- Name: idx_order_item_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_item_order ON public."OrderItem" USING btree (order_id);


--
-- Name: idx_product_price_bracket_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_price_bracket_product ON public."ProductPriceBracket" USING btree (product_id);


--
-- Name: OrderItem OrderItem_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public."Order"(id) ON DELETE CASCADE;


--
-- Name: OrderItem OrderItem_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public."Product"(id);


--
-- Name: ProductHeightPriceTier ProductHeightPriceTier_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductHeightPriceTier"
    ADD CONSTRAINT "ProductHeightPriceTier_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public."Product"(id) ON DELETE CASCADE;


--
-- Name: ProductPriceBracket ProductPriceBracket_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductPriceBracket"
    ADD CONSTRAINT "ProductPriceBracket_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public."Product"(id) ON DELETE CASCADE;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: remeskodev_qapi
--

REVOKE ALL ON SCHEMA public FROM remeskodev_qapi;
REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO remeskodev_qapi WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO PUBLIC;
GRANT ALL ON SCHEMA public TO pg_checkpoint WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_create_subscription WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_database_owner WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_execute_server_program WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_maintain WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_monitor WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_read_all_data WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_read_all_settings WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_read_all_stats WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_read_server_files WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_signal_autovacuum_worker WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_signal_backend WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_stat_scan_tables WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_use_reserved_connections WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_write_all_data WITH GRANT OPTION;
GRANT ALL ON SCHEMA public TO pg_write_server_files WITH GRANT OPTION;


--
-- Name: TABLE "Category"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public."Category" TO remeskodev_qapi;


--
-- Name: SEQUENCE "Category_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public."Category_id_seq" TO remeskodev_qapi;


--
-- Name: TABLE "Customer"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public."Customer" TO remeskodev_qapi;


--
-- Name: SEQUENCE "Customer_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public."Customer_id_seq" TO remeskodev_qapi;


--
-- Name: TABLE "FabricGroup"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public."FabricGroup" TO remeskodev_qapi;


--
-- Name: SEQUENCE "FabricGroup_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public."FabricGroup_id_seq" TO remeskodev_qapi;


--
-- Name: TABLE "Image"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public."Image" TO remeskodev_qapi;


--
-- Name: TABLE "MeasureGuidePage"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public."MeasureGuidePage" TO remeskodev_qapi;


--
-- Name: TABLE "MeasureGuideSection"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public."MeasureGuideSection" TO remeskodev_qapi;


--
-- Name: SEQUENCE "MeasureGuideSection_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public."MeasureGuideSection_id_seq" TO remeskodev_qapi;


--
-- Name: TABLE "Order"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public."Order" TO remeskodev_qapi;


--
-- Name: TABLE "OrderItem"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public."OrderItem" TO remeskodev_qapi;


--
-- Name: SEQUENCE "OrderItem_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public."OrderItem_id_seq" TO remeskodev_qapi;


--
-- Name: SEQUENCE "Order_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public."Order_id_seq" TO remeskodev_qapi;


--
-- Name: TABLE "Product"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public."Product" TO remeskodev_qapi;


--
-- Name: TABLE "ProductHeightPriceTier"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public."ProductHeightPriceTier" TO remeskodev_qapi;


--
-- Name: SEQUENCE "ProductHeightPriceTier_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public."ProductHeightPriceTier_id_seq" TO remeskodev_qapi;


--
-- Name: TABLE "ProductPriceBracket"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public."ProductPriceBracket" TO remeskodev_qapi;


--
-- Name: SEQUENCE "ProductPriceBracket_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public."ProductPriceBracket_id_seq" TO remeskodev_qapi;


--
-- Name: SEQUENCE "Product_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public."Product_id_seq" TO remeskodev_qapi;


--
-- Name: TABLE leads; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.leads TO remeskodev_qapi;


--
-- Name: SEQUENCE leads_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.leads_id_seq TO remeskodev_qapi;


--
-- Name: TABLE pageviews; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pageviews TO remeskodev_qapi;


--
-- Name: SEQUENCE pageviews_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.pageviews_id_seq TO remeskodev_qapi;


--
-- Name: TABLE popup_stats; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.popup_stats TO remeskodev_qapi;


--
-- Name: SEQUENCE popup_stats_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.popup_stats_id_seq TO remeskodev_qapi;


--
-- Name: TABLE settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.settings TO remeskodev_qapi;


--
-- Name: TABLE visits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.visits TO remeskodev_qapi;


--
-- Name: SEQUENCE visits_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.visits_id_seq TO remeskodev_qapi;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO remeskodev_qapi;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO remeskodev_qapi;


--
-- PostgreSQL database dump complete
--

\unrestrict KdGO8RnZyjpBq1oboEm0AfAgq7It3M07K6cy6fWev0YEQlVT7aGJIsprUS2w1Eo

