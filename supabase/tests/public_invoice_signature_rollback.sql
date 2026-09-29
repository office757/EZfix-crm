begin;
create temp table sig_results(test text,passed boolean not null check(passed));
grant all on sig_results to anon,authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select auth_user_id from public.team where role='owner' and status='active' limit 1),'role','authenticated')::text,true);
insert into public.invoices(id,number,items,app_data) values ('qa_signature_20260929','QA-SIGNATURE-20260929','[{"qty":1,"rate":50}]','{"preserved":"yes"}');
insert into public.public_invoice_access_tokens(invoice_id,token_hash,expires_at) values
 ('qa_signature_20260929',encode(extensions.digest('91c728dbe32848c9a829c473098721da91c728dbe32848c9a829c473098721da','sha256'),'hex'),now()+interval '1 hour'),
 ('qa_signature_20260929',encode(extensions.digest('62bc735e328248c9a829c473098721da62bc735e328248c9a829c473098721da','sha256'),'hex'),now()-interval '1 hour');
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$begin
 begin perform public.sign_public_invoice('qa_signature_20260929',repeat('c',64),'QA','data:image/png;base64,AAAA','v1');raise exception 'TEST_FAILED';exception when others then if sqlerrm<>'Invoice access expired or invalid' then raise;end if;end;
 insert into sig_results values ('wrong token rejected',true);
 begin perform public.sign_public_invoice('qa_signature_20260929','62bc735e328248c9a829c473098721da62bc735e328248c9a829c473098721da','QA','data:image/png;base64,AAAA','v1');raise exception 'TEST_FAILED';exception when others then if sqlerrm<>'Invoice access expired or invalid' then raise;end if;end;
 insert into sig_results values ('expired token rejected',true);
 begin perform public.sign_public_invoice('other_invoice','91c728dbe32848c9a829c473098721da91c728dbe32848c9a829c473098721da','QA','data:image/png;base64,AAAA','v1');raise exception 'TEST_FAILED';exception when others then if sqlerrm<>'Invoice access expired or invalid' then raise;end if;end;
 insert into sig_results values ('token bound to invoice',true);
 begin perform public.sign_public_invoice('qa_signature_20260929','91c728dbe32848c9a829c473098721da91c728dbe32848c9a829c473098721da','QA',null,'v1');raise exception 'TEST_FAILED';exception when others then if sqlerrm<>'Signature must be a supported image data URL' then raise;end if;end;
 insert into sig_results values ('null signature rejected',true);
end$$;
insert into sig_results select 'anonymous signing succeeds',(public.sign_public_invoice('qa_signature_20260929','91c728dbe32848c9a829c473098721da91c728dbe32848c9a829c473098721da','QA','data:image/png;base64,AAAA','v1')->>'ok')::boolean;
insert into sig_results select 'repeat signing idempotent',(public.sign_public_invoice('qa_signature_20260929','91c728dbe32848c9a829c473098721da91c728dbe32848c9a829c473098721da','Other','data:image/png;base64,BBBB','v1')->>'already_signed')::boolean;
reset role;
insert into sig_results select 'signature persisted and metadata preserved',app_data->>'preserved'='yes' and app_data->'customerInvoiceSignature'->>'name'='QA' from public.invoices where id='qa_signature_20260929';
insert into sig_results select 'one signature audit',count(*)=1 from public.audit_log where entity_id='qa_signature_20260929' and action='invoice_signed_remote';
insert into sig_results values('no direct anonymous metadata update',not has_table_privilege('anon','public.invoices','UPDATE'));
select jsonb_build_object('passed',count(*),'tests',jsonb_agg(test)) from sig_results;
rollback;
