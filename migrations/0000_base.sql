CREATE SEQUENCE "public"."item_display_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"user_name" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_options" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"user_id" varchar,
	"user_name" text NOT NULL,
	"content" text NOT NULL,
	"item_status" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultas_de_estoque" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"event_id" varchar NOT NULL,
	"pedido_por" text,
	"pedido_por_id" varchar,
	"pedido_em" timestamp DEFAULT now() NOT NULL,
	"observacao" text,
	"status" text DEFAULT 'aberta' NOT NULL,
	"quantidade_pedida" integer NOT NULL,
	"quantidade_atendida" integer,
	"ativos_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"observacao_resposta" text,
	"foto_url" text,
	"respondido_por" text,
	"respondido_por_id" varchar,
	"respondido_em" timestamp,
	"aplicado_em" timestamp
);
--> statement-breakpoint
CREATE TABLE "delivery_photos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"photo_url" text NOT NULL,
	"kind" text DEFAULT 'delivery' NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_destinatarios" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canal" text NOT NULL,
	"email" text NOT NULL,
	"added_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_books" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"book_url" text NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_inventory_allocations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"asset_id" varchar NOT NULL,
	"allocated_at" timestamp DEFAULT now() NOT NULL,
	"item_id" varchar,
	"reservado_por" text,
	"reservado_por_id" varchar
);
--> statement-breakpoint
CREATE TABLE "event_quota_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"quota" text NOT NULL,
	"item_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sponsors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"sponsor_id" varchar NOT NULL,
	"quota" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"truck_departure_date" timestamp NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"reopened_at" timestamp,
	"priority" text,
	"priority_manual" boolean DEFAULT false NOT NULL,
	"franchise" text,
	"approval_book_url" text,
	"created_by" varchar,
	"deadline_lista_imagens" integer DEFAULT -25,
	"deadline_entrega_layouts" integer DEFAULT -20,
	"deadline_aprovacao_layout" integer DEFAULT -12,
	"deadline_finalizacao" integer DEFAULT -10,
	"deadline_revisao_lista" integer DEFAULT -8,
	"deadline_producao_grafica" integer DEFAULT -1,
	"prazo_molde" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_quota_rules" (
	"quota" text PRIMARY KEY NOT NULL,
	"item_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_item_id" varchar,
	"display_id" text NOT NULL,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"franchise_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"sponsor_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"approval_thumb_url" text,
	"condition" text DEFAULT 'PERFEITO' NOT NULL,
	"location" text,
	"tracking_status" text DEFAULT 'NO_GALPAO' NOT NULL,
	"notes" text,
	"auto_added" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_assets_display_id_unique" UNIQUE("display_id")
);
--> statement-breakpoint
CREATE TABLE "item_art_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"thumb_url" text NOT NULL,
	"origem" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_sponsor_approvals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"sponsor_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"rejected_by" text,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"decided_thumb_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_sponsors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"sponsor_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_id" text NOT NULL,
	"event_id" varchar NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"quantity" integer NOT NULL,
	"area" numeric(10, 2) NOT NULL,
	"visual" numeric(10, 2) NOT NULL,
	"visual_width" numeric(10, 2),
	"visual_height" numeric(10, 2),
	"file_width" numeric(10, 2),
	"file_height" numeric(10, 2),
	"material" text NOT NULL,
	"finish" text NOT NULL,
	"measurement" text NOT NULL,
	"calculated_m2" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"observations" text,
	"quantity_produced" integer,
	"received_by" text,
	"delivery_photo_url" text,
	"skip_approval" boolean DEFAULT false NOT NULL,
	"is_reuse" boolean DEFAULT false NOT NULL,
	"reuse_qty" integer DEFAULT 0 NOT NULL,
	"approval_thumb_url" text,
	"previous_approval_thumb_url" text,
	"approval_thumb_updated_at" timestamp,
	"has_modified_data" boolean DEFAULT false NOT NULL,
	"final_file_url" text,
	"final_file_name" text,
	"final_preview_url" text,
	"final_file_updated_at" timestamp,
	"final_file_acked_at" timestamp,
	"previous_final_file_url" text,
	"previous_final_file_name" text,
	"conference_notes" text,
	"delivery_notes" text,
	"conference_photo_url" text,
	"conferred_at" timestamp,
	"conferred_qty" integer DEFAULT 0 NOT NULL,
	"delivered_qty" integer DEFAULT 0 NOT NULL,
	"parent_item_id" varchar,
	"complement_seq" integer,
	"complement_reason" text,
	"complement_requested_by" text,
	"complement_requested_at" timestamp,
	"sponsor_approved_by" text,
	"sponsor_approved_at" timestamp,
	"creator_reviewed_at" timestamp,
	"rejected_by_sponsor" boolean DEFAULT false NOT NULL,
	"rejected_by_creator" boolean DEFAULT false NOT NULL,
	"rejection_reason" text,
	"approved_at" timestamp,
	"production_started_at" timestamp,
	"print_machine" text,
	"maquina_prevista" text,
	"reserva_por_maquina" jsonb,
	"impressao_por_maquina" jsonb,
	"travada_em" timestamp,
	"travada_por" text,
	"travada_por_id" varchar,
	"travada_motivo" text,
	"produced_at" timestamp,
	"status_changed_at" timestamp,
	"standard_item_id" varchar,
	"pedido_de_peca_id" varchar,
	"pedido_de_peca_linha_id" varchar,
	"kit_remessa_id" varchar,
	"criado_por_id" varchar,
	"delivered_at" timestamp,
	"label_printed_at" timestamp,
	"tubo_id" varchar,
	"embalada_qty" integer DEFAULT 0 NOT NULL,
	"reference_url" text,
	"reference_urls" text[],
	"is_priority" boolean DEFAULT false NOT NULL,
	"status_before_cancel" text,
	"motivo_cancelamento" text,
	"book_url" text,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "items_display_id_unique" UNIQUE("display_id")
);
--> statement-breakpoint
CREATE TABLE "kit_remessas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"versao" text NOT NULL,
	"solicitante" text,
	"departamento" text,
	"data_solicitacao" timestamp,
	"entrega_material" timestamp NOT NULL,
	"data_evento" timestamp,
	"carga_caminhao" timestamp,
	"saida_caminhao" timestamp,
	"arquivo" text,
	"criado_por" text,
	"criado_por_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos_de_peca_linhas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" varchar NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"event_id" varchar NOT NULL,
	"sponsor_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"quantidade" integer NOT NULL,
	"observacao" text NOT NULL,
	"referencias" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" text DEFAULT 'aberto' NOT NULL,
	"precisa_ate" timestamp,
	"tipo_de_peca" text,
	"largura" numeric(10, 2),
	"altura" numeric(10, 2),
	"resolvido_por" text,
	"resolvido_por_id" varchar,
	"resolvido_em" timestamp,
	"motivo_recusa" text,
	"motivo_cancelamento" text,
	"ajuste_status" text,
	"ajuste_texto" text,
	"ajuste_pedido_por" text,
	"ajuste_pedido_por_id" varchar,
	"ajuste_pedido_em" timestamp,
	"ajuste_respondido_por" text,
	"ajuste_respondido_em" timestamp,
	"ajuste_resposta" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"event_id" varchar,
	"item_id" varchar,
	"target_roles" text[] DEFAULT ARRAY['admin', 'solicitacao', 'arte', 'grafica', 'atendimento']::text[] NOT NULL,
	"target_user_id" varchar,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos_de_peca" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar,
	"sponsor_id" varchar,
	"quantidade" integer,
	"observacao" text,
	"referencias" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" text DEFAULT 'aberto' NOT NULL,
	"precisa_ate" timestamp,
	"tipo_de_peca" text,
	"largura" numeric(10, 2),
	"altura" numeric(10, 2),
	"editado_por" text,
	"editado_em" timestamp,
	"pedido_por" text,
	"pedido_por_id" varchar,
	"item_id" varchar,
	"resolvido_por" text,
	"resolvido_por_id" varchar,
	"resolvido_em" timestamp,
	"motivo_recusa" text,
	"motivo_cancelamento" text,
	"ajuste_status" text,
	"ajuste_texto" text,
	"ajuste_pedido_por" text,
	"ajuste_pedido_por_id" varchar,
	"ajuste_pedido_em" timestamp,
	"ajuste_respondido_por" text,
	"ajuste_respondido_em" timestamp,
	"ajuste_resposta" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prazo_cobrancas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" varchar NOT NULL,
	"user_name" text NOT NULL,
	"promised_for" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prazo_event_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" text NOT NULL,
	"event_id" varchar NOT NULL,
	"has_overdue" boolean NOT NULL,
	"pecas_atrasadas" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prazo_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" text NOT NULL,
	"atrasados" integer NOT NULL,
	"saidas_7d" integer NOT NULL,
	"pecas_atrasadas" integer NOT NULL,
	"em_dia" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prazo_snapshots_day_unique" UNIQUE("day")
);
--> statement-breakpoint
CREATE TABLE "production_updates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"delivered_by" text,
	"photo_url" text,
	"quantity_produced" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registros_de_impressao" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"maquina" text NOT NULL,
	"tipo" text NOT NULL,
	"quantidade" integer DEFAULT 0 NOT NULL,
	"total_depois" integer,
	"user_name" text,
	"user_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservas_de_disparo" (
	"chave" text PRIMARY KEY NOT NULL,
	"reservado_em" timestamp DEFAULT now() NOT NULL,
	"instancia" text,
	"desfecho" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"contact_person" text,
	"notes" text,
	"color" text DEFAULT '#3b82f6',
	"quota" text,
	"strict_approval" boolean DEFAULT false NOT NULL,
	"account_executive_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_tokens_de_troca" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"expira_em" timestamp NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standard_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"area" numeric(10, 2),
	"visual" numeric(10, 2),
	"visual_width" numeric(10, 2),
	"visual_height" numeric(10, 2),
	"file_width" numeric(10, 2),
	"file_height" numeric(10, 2),
	"group" text,
	"material" text,
	"finish" text,
	"has_variable_measurement" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tubo_itens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tubo_id" varchar NOT NULL,
	"item_id" varchar NOT NULL,
	"quantidade" integer NOT NULL,
	"embalado_em" timestamp DEFAULT now() NOT NULL,
	"embalado_por" text,
	"fotos" text[],
	"entregue_em" timestamp,
	CONSTRAINT "tubo_itens_quantidade_check" CHECK (quantidade > 0)
);
--> statement-breakpoint
CREATE TABLE "tubos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"numero" integer NOT NULL,
	"avulso" boolean DEFAULT false NOT NULL,
	"criado_por" text,
	"fotos_fechamento" text[],
	"fechado_em" timestamp,
	"fechado_por" text,
	"conteudo_alterado_em" timestamp,
	"entregue_em" timestamp,
	"recebido_por" text,
	"foto_entrega_url" text,
	"entregue_obs" text,
	"entregue_por" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'solicitacao' NOT NULL,
	"kit" boolean DEFAULT false NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultas_de_estoque" ADD CONSTRAINT "consultas_de_estoque_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultas_de_estoque" ADD CONSTRAINT "consultas_de_estoque_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_photos" ADD CONSTRAINT "delivery_photos_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_books" ADD CONSTRAINT "event_books_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_inventory_allocations" ADD CONSTRAINT "event_inventory_allocations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_inventory_allocations" ADD CONSTRAINT "event_inventory_allocations_asset_id_inventory_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."inventory_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_inventory_allocations" ADD CONSTRAINT "event_inventory_allocations_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_quota_rules" ADD CONSTRAINT "event_quota_rules_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD CONSTRAINT "event_sponsors_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD CONSTRAINT "event_sponsors_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_assets" ADD CONSTRAINT "inventory_assets_original_item_id_items_id_fk" FOREIGN KEY ("original_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_art_versions" ADD CONSTRAINT "item_art_versions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_sponsor_approvals" ADD CONSTRAINT "item_sponsor_approvals_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_sponsor_approvals" ADD CONSTRAINT "item_sponsor_approvals_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_sponsors" ADD CONSTRAINT "item_sponsors_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_sponsors" ADD CONSTRAINT "item_sponsors_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_parent_item_id_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_standard_item_id_standard_items_id_fk" FOREIGN KEY ("standard_item_id") REFERENCES "public"."standard_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_pedido_de_peca_id_pedidos_de_peca_id_fk" FOREIGN KEY ("pedido_de_peca_id") REFERENCES "public"."pedidos_de_peca"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_pedido_de_peca_linha_id_pedidos_de_peca_linhas_id_fk" FOREIGN KEY ("pedido_de_peca_linha_id") REFERENCES "public"."pedidos_de_peca_linhas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_kit_remessa_id_kit_remessas_id_fk" FOREIGN KEY ("kit_remessa_id") REFERENCES "public"."kit_remessas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_tubo_id_tubos_id_fk" FOREIGN KEY ("tubo_id") REFERENCES "public"."tubos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_remessas" ADD CONSTRAINT "kit_remessas_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_de_peca_linhas" ADD CONSTRAINT "pedidos_de_peca_linhas_pedido_id_pedidos_de_peca_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_de_peca"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_de_peca_linhas" ADD CONSTRAINT "pedidos_de_peca_linhas_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_de_peca" ADD CONSTRAINT "pedidos_de_peca_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_de_peca" ADD CONSTRAINT "pedidos_de_peca_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_de_peca" ADD CONSTRAINT "pedidos_de_peca_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prazo_event_snapshots" ADD CONSTRAINT "prazo_event_snapshots_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_updates" ADD CONSTRAINT "production_updates_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_de_impressao" ADD CONSTRAINT "registros_de_impressao_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_account_executive_id_users_id_fk" FOREIGN KEY ("account_executive_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tubo_itens" ADD CONSTRAINT "tubo_itens_tubo_id_tubos_id_fk" FOREIGN KEY ("tubo_id") REFERENCES "public"."tubos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tubo_itens" ADD CONSTRAINT "tubo_itens_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tubos" ADD CONSTRAINT "tubos_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_audit_logs_entity_created" ON "audit_logs" USING btree ("entity_type","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "IDX_comments_item_id" ON "comments" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "IDX_consultas_de_estoque_item" ON "consultas_de_estoque" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "IDX_consultas_de_estoque_status" ON "consultas_de_estoque" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_consultas_de_estoque_aberta_por_peca" ON "consultas_de_estoque" USING btree ("item_id") WHERE status = 'aberta';--> statement-breakpoint
CREATE INDEX "IDX_delivery_photos_item_id" ON "delivery_photos" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "IDX_event_books_event_id" ON "event_books" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "IDX_event_inventory_allocations_event_id" ON "event_inventory_allocations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "IDX_event_inventory_allocations_asset_id" ON "event_inventory_allocations" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "IDX_event_inventory_allocations_item_id" ON "event_inventory_allocations" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "IDX_event_quota_rules_event_id" ON "event_quota_rules" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "IDX_event_sponsors_event_id" ON "event_sponsors" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "IDX_event_sponsors_sponsor_id" ON "event_sponsors" USING btree ("sponsor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_event_sponsors_evento_patrocinador" ON "event_sponsors" USING btree ("event_id","sponsor_id");--> statement-breakpoint
CREATE INDEX "IDX_events_created_at" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_inventory_assets_original_item_id" ON "inventory_assets" USING btree ("original_item_id");--> statement-breakpoint
CREATE INDEX "IDX_inventory_assets_tracking_status" ON "inventory_assets" USING btree ("tracking_status");--> statement-breakpoint
CREATE INDEX "IDX_item_art_versions_item_id" ON "item_art_versions" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "IDX_item_sponsor_approvals_item_id" ON "item_sponsor_approvals" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "IDX_item_sponsor_approvals_sponsor_id" ON "item_sponsor_approvals" USING btree ("sponsor_id");--> statement-breakpoint
CREATE INDEX "IDX_item_sponsor_approvals_status" ON "item_sponsor_approvals" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_item_sponsor_approvals_peca_patrocinador" ON "item_sponsor_approvals" USING btree ("item_id","sponsor_id");--> statement-breakpoint
CREATE INDEX "IDX_item_sponsors_item_id" ON "item_sponsors" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "IDX_item_sponsors_sponsor_id" ON "item_sponsors" USING btree ("sponsor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_item_sponsors_peca_patrocinador" ON "item_sponsors" USING btree ("item_id","sponsor_id");--> statement-breakpoint
CREATE INDEX "IDX_items_event_id" ON "items" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "IDX_items_tubo_id" ON "items" USING btree ("tubo_id");--> statement-breakpoint
CREATE INDEX "IDX_items_status" ON "items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_items_created_at" ON "items" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_items_deleted_at" ON "items" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "IDX_items_parent_item_id" ON "items" USING btree ("parent_item_id");--> statement-breakpoint
CREATE INDEX "IDX_items_event_created" ON "items" USING btree ("event_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "IDX_items_updated_at" ON "items" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "IDX_items_criado_por_kit" ON "items" USING btree ("criado_por_id","kit_remessa_id");--> statement-breakpoint
CREATE INDEX "IDX_kit_remessas_event" ON "kit_remessas" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "IDX_pedidos_de_peca_linhas_pedido" ON "pedidos_de_peca_linhas" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "IDX_pedidos_de_peca_linhas_event_status" ON "pedidos_de_peca_linhas" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "IDX_notifications_created_at" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_notifications_is_read" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "IDX_pedidos_de_peca_event_status" ON "pedidos_de_peca" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "IDX_pedidos_de_peca_status" ON "pedidos_de_peca" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_prazo_cobrancas_target" ON "prazo_cobrancas" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "IDX_prazo_cobrancas_target_id_created" ON "prazo_cobrancas" USING btree ("target_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_prazo_event_snapshots_day_event" ON "prazo_event_snapshots" USING btree ("day","event_id");--> statement-breakpoint
CREATE INDEX "IDX_prazo_event_snapshots_day" ON "prazo_event_snapshots" USING btree ("day");--> statement-breakpoint
CREATE INDEX "IDX_production_updates_item_id" ON "production_updates" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "IDX_registros_impressao_maquina_data" ON "registros_de_impressao" USING btree ("maquina","created_at");--> statement-breakpoint
CREATE INDEX "IDX_registros_impressao_item" ON "registros_de_impressao" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "IDX_registros_impressao_created_at" ON "registros_de_impressao" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "session" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "IDX_sso_tokens_expira" ON "sso_tokens_de_troca" USING btree ("expira_em");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_tubo_itens_tubo_item" ON "tubo_itens" USING btree ("tubo_id","item_id");--> statement-breakpoint
CREATE INDEX "IDX_tubo_itens_item" ON "tubo_itens" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_tubos_evento_numero" ON "tubos" USING btree ("event_id","numero");