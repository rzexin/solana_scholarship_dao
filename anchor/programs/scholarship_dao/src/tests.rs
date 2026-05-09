#[cfg(test)]
mod tests {
    use crate::{
        Application, ApplicationStatus, Dao, ID as PROGRAM_ID, DESCRIPTION_LEN, ICON_URI_LEN,
        NAME_LEN, PROOF_CID_MAX_LEN,
    };
    use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
    use litesvm::LiteSVM;
    use solana_sdk::{
        clock::Clock, instruction::Instruction, pubkey::Pubkey, signature::Keypair,
        signer::Signer, system_program, transaction::Transaction,
    };

    const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
    const PROGRAM_SO_PATH: &str = "../../target/deploy/scholarship_dao.so";

    const DEFAULT_QUORUM: u16 = 1;
    const DEFAULT_VOTING_PERIOD: i64 = 60;
    const DEFAULT_DAO_ID: u64 = 0;

    fn derive_dao_pda(creator: &Pubkey) -> (Pubkey, u8) {
        derive_dao_pda_with_id(creator, DEFAULT_DAO_ID)
    }

    fn derive_dao_pda_with_id(creator: &Pubkey, dao_id: u64) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"dao", creator.as_ref(), &dao_id.to_le_bytes()],
            &PROGRAM_ID,
        )
    }

    fn derive_treasury_pda(dao: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"treasury", dao.as_ref()], &PROGRAM_ID)
    }

    fn derive_member_pda(dao: &Pubkey, wallet: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"member", dao.as_ref(), wallet.as_ref()], &PROGRAM_ID)
    }

    fn derive_application_pda(dao: &Pubkey, id: u64) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"app", dao.as_ref(), &id.to_le_bytes()], &PROGRAM_ID)
    }

    fn derive_vote_pda(application: &Pubkey, member: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"vote", application.as_ref(), member.as_ref()],
            &PROGRAM_ID,
        )
    }

    fn setup_svm_with_program() -> (LiteSVM, Keypair) {
        let mut svm = LiteSVM::new();
        let program_bytes = std::fs::read(PROGRAM_SO_PATH)
            .expect("missing target/deploy/scholarship_dao.so – run `anchor build` first");
        svm.add_program(PROGRAM_ID, &program_bytes);

        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 100 * LAMPORTS_PER_SOL)
            .unwrap();
        (svm, payer)
    }

    /// 把当前 Clock 向前推进若干秒（用于跨过 voting_ends_at）
    fn warp_clock_by(svm: &mut LiteSVM, seconds: i64) {
        let mut clock: Clock = svm.get_sysvar();
        clock.unix_timestamp = clock.unix_timestamp.saturating_add(seconds);
        svm.set_sysvar::<Clock>(&clock);
    }

    fn read_dao(svm: &LiteSVM, dao_pk: &Pubkey) -> Dao {
        let acc = svm.get_account(dao_pk).expect("dao account exists");
        Dao::try_deserialize(&mut &acc.data[..]).expect("decode Dao")
    }

    fn read_application(svm: &LiteSVM, app_pk: &Pubkey) -> Application {
        let acc = svm.get_account(app_pk).expect("application account exists");
        Application::try_deserialize(&mut &acc.data[..]).expect("decode Application")
    }

    fn fixed_bytes<const N: usize>(text: &str) -> [u8; N] {
        let bytes = text.as_bytes();
        assert!(bytes.len() <= N, "text too long for fixed buffer");
        let mut out = [0u8; N];
        out[..bytes.len()].copy_from_slice(bytes);
        out
    }

    fn build_initialize_ix_full(
        creator: &Pubkey,
        name: [u8; NAME_LEN],
        description: [u8; DESCRIPTION_LEN],
        icon_uri: [u8; ICON_URI_LEN],
        vote_threshold: u16,
        quorum: u16,
        voting_period: i64,
        min_donation: u64,
    ) -> Instruction {
        let (dao, _) = derive_dao_pda(creator);

        let accounts = crate::accounts::InitializeDao {
            creator: *creator,
            dao,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let data = crate::instruction::InitializeDao {
            dao_id: DEFAULT_DAO_ID,
            name,
            description,
            icon_uri,
            vote_threshold,
            quorum,
            voting_period,
            min_donation,
        }
        .data();

        Instruction {
            program_id: PROGRAM_ID,
            accounts,
            data,
        }
    }

    /// 简化版：用默认 metadata + 默认 quorum/voting_period，便于现有测试无侵入迁移
    fn build_initialize_ix(
        creator: &Pubkey,
        vote_threshold: u16,
        min_donation: u64,
    ) -> Instruction {
        build_initialize_ix_full(
            creator,
            fixed_bytes::<NAME_LEN>("Test DAO"),
            fixed_bytes::<DESCRIPTION_LEN>(""),
            fixed_bytes::<ICON_URI_LEN>(""),
            vote_threshold,
            DEFAULT_QUORUM,
            DEFAULT_VOTING_PERIOD,
            min_donation,
        )
    }

    fn build_donate_ix(creator_pk: &Pubkey, donor: &Pubkey, amount: u64) -> Instruction {
        let (dao, _) = derive_dao_pda(creator_pk);
        let (treasury, _) = derive_treasury_pda(&dao);
        let (member, _) = derive_member_pda(&dao, donor);

        let accounts = crate::accounts::Donate {
            donor: *donor,
            dao,
            treasury,
            member,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let data = crate::instruction::Donate { amount }.data();

        Instruction {
            program_id: PROGRAM_ID,
            accounts,
            data,
        }
    }

    fn build_create_application_ix(
        creator_pk: &Pubkey,
        proposer: &Pubkey,
        application_id: u64,
        amount: u64,
        recipient: Pubkey,
        reason: &str,
    ) -> Instruction {
        build_create_application_ix_with_proof(
            creator_pk,
            proposer,
            application_id,
            amount,
            recipient,
            reason,
            "",
        )
    }

    fn build_create_application_ix_with_proof(
        creator_pk: &Pubkey,
        proposer: &Pubkey,
        application_id: u64,
        amount: u64,
        recipient: Pubkey,
        reason: &str,
        proof_cid: &str,
    ) -> Instruction {
        let (dao, _) = derive_dao_pda(creator_pk);
        let (application, _) = derive_application_pda(&dao, application_id);

        let accounts = crate::accounts::CreateApplication {
            proposer: *proposer,
            dao,
            application,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let data = crate::instruction::CreateApplication {
            amount,
            recipient,
            reason: reason.to_string(),
            proof_cid: proof_cid.to_string(),
        }
        .data();

        Instruction {
            program_id: PROGRAM_ID,
            accounts,
            data,
        }
    }

    fn build_vote_ix(
        creator_pk: &Pubkey,
        voter: &Pubkey,
        application_id: u64,
        support: bool,
    ) -> Instruction {
        let (dao, _) = derive_dao_pda(creator_pk);
        let (member, _) = derive_member_pda(&dao, voter);
        let (application, _) = derive_application_pda(&dao, application_id);
        let (vote_record, _) = derive_vote_pda(&application, &member);

        let accounts = crate::accounts::Vote {
            voter: *voter,
            dao,
            member,
            application,
            vote_record,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let data = crate::instruction::Vote {
            application_id,
            support,
        }
        .data();

        Instruction {
            program_id: PROGRAM_ID,
            accounts,
            data,
        }
    }

    /// 跨 DAO 装配的 vote 指令：用 dao_a 做派生根，但 member 来自 dao_b 派生
    fn build_cross_dao_vote_ix(
        dao_a_creator: &Pubkey,
        dao_b_creator: &Pubkey,
        voter: &Pubkey,
        application_id: u64,
    ) -> Instruction {
        let (dao_a, _) = derive_dao_pda(dao_a_creator);
        let (dao_b, _) = derive_dao_pda(dao_b_creator);
        let (member_b, _) = derive_member_pda(&dao_b, voter);
        let (application_a, _) = derive_application_pda(&dao_a, application_id);
        let (vote_record, _) = derive_vote_pda(&application_a, &member_b);

        let accounts = crate::accounts::Vote {
            voter: *voter,
            dao: dao_a,
            member: member_b,
            application: application_a,
            vote_record,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let data = crate::instruction::Vote {
            application_id,
            support: true,
        }
        .data();

        Instruction {
            program_id: PROGRAM_ID,
            accounts,
            data,
        }
    }

    fn build_execute_ix(
        creator_pk: &Pubkey,
        executor: &Pubkey,
        application_id: u64,
        recipient: Pubkey,
    ) -> Instruction {
        let (dao, _) = derive_dao_pda(creator_pk);
        let (treasury, _) = derive_treasury_pda(&dao);
        let (application, _) = derive_application_pda(&dao, application_id);

        let accounts = crate::accounts::Execute {
            executor: *executor,
            dao,
            treasury,
            application,
            recipient,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let data = crate::instruction::Execute { application_id }.data();

        Instruction {
            program_id: PROGRAM_ID,
            accounts,
            data,
        }
    }

    fn build_cancel_ix(
        creator_pk: &Pubkey,
        signer: &Pubkey,
        application_id: u64,
    ) -> Instruction {
        let (dao, _) = derive_dao_pda(creator_pk);
        let (application, _) = derive_application_pda(&dao, application_id);

        let accounts = crate::accounts::CancelApplication {
            signer: *signer,
            dao,
            application,
        }
        .to_account_metas(None);

        let data = crate::instruction::CancelApplication { application_id }.data();

        Instruction {
            program_id: PROGRAM_ID,
            accounts,
            data,
        }
    }

    fn build_update_metadata_ix(
        creator_pk: &Pubkey,
        admin: &Pubkey,
        name: Option<[u8; NAME_LEN]>,
        description: Option<[u8; DESCRIPTION_LEN]>,
        icon_uri: Option<[u8; ICON_URI_LEN]>,
    ) -> Instruction {
        let (dao, _) = derive_dao_pda(creator_pk);

        let accounts = crate::accounts::UpdateDaoMetadata {
            admin: *admin,
            dao,
        }
        .to_account_metas(None);

        let data = crate::instruction::UpdateDaoMetadata {
            name,
            description,
            icon_uri,
        }
        .data();

        Instruction {
            program_id: PROGRAM_ID,
            accounts,
            data,
        }
    }

    fn send(
        svm: &mut LiteSVM,
        payer: &Keypair,
        signers: &[&Keypair],
        ix: Instruction,
    ) -> Result<(), String> {
        let blockhash = svm.latest_blockhash();
        let mut all_signers: Vec<&Keypair> = vec![payer];
        all_signers.extend_from_slice(signers);
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&payer.pubkey()),
            &all_signers,
            blockhash,
        );
        svm.send_transaction(tx)
            .map(|_| ())
            .map_err(|e| format!("{:?}", e))
    }

    // ============================================================
    // 既有 happy / sad path（适配新签名 + warp clock）
    // ============================================================

    #[test]
    fn test_happy_path() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();

        let init_ix = build_initialize_ix(&creator_pk, 2, 10_000_000);
        send(&mut svm, &creator, &[], init_ix).expect("init should succeed");

        let donor_a = Keypair::new();
        let donor_b = Keypair::new();
        svm.airdrop(&donor_a.pubkey(), 5 * LAMPORTS_PER_SOL)
            .unwrap();
        svm.airdrop(&donor_b.pubkey(), 5 * LAMPORTS_PER_SOL)
            .unwrap();

        send(
            &mut svm,
            &donor_a,
            &[],
            build_donate_ix(&creator_pk, &donor_a.pubkey(), LAMPORTS_PER_SOL),
        )
        .expect("donor A donates");
        send(
            &mut svm,
            &donor_b,
            &[],
            build_donate_ix(&creator_pk, &donor_b.pubkey(), LAMPORTS_PER_SOL),
        )
        .expect("donor B donates");

        let (dao, _) = derive_dao_pda(&creator_pk);
        let (treasury, _) = derive_treasury_pda(&dao);
        let treasury_acc = svm.get_account(&treasury).expect("treasury exists");
        assert_eq!(treasury_acc.lamports, 2 * LAMPORTS_PER_SOL);

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), 2 * LAMPORTS_PER_SOL)
            .unwrap();
        let recipient = Keypair::new();
        let amount = 500_000_000;

        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                amount,
                recipient.pubkey(),
                "学费补贴",
            ),
        )
        .expect("create application");

        send(
            &mut svm,
            &donor_a,
            &[],
            build_vote_ix(&creator_pk, &donor_a.pubkey(), 0, true),
        )
        .expect("donor A votes for");
        send(
            &mut svm,
            &donor_b,
            &[],
            build_vote_ix(&creator_pk, &donor_b.pubkey(), 0, true),
        )
        .expect("donor B votes for");

        warp_clock_by(&mut svm, DEFAULT_VOTING_PERIOD + 5);

        let executor = Keypair::new();
        svm.airdrop(&executor.pubkey(), LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &executor,
            &[],
            build_execute_ix(&creator_pk, &executor.pubkey(), 0, recipient.pubkey()),
        )
        .expect("execute");

        let recipient_acc = svm
            .get_account(&recipient.pubkey())
            .expect("recipient exists");
        assert_eq!(recipient_acc.lamports, amount);

        let treasury_acc = svm.get_account(&treasury).expect("treasury still exists");
        assert_eq!(treasury_acc.lamports, 2 * LAMPORTS_PER_SOL - amount);
    }

    #[test]
    fn test_donate_too_small() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 10_000_000),
        )
        .unwrap();

        let donor = Keypair::new();
        svm.airdrop(&donor.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let result = send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_pk, &donor.pubkey(), 1_000_000),
        );
        assert!(result.is_err(), "donate below min_donation should fail");
    }

    #[test]
    fn test_double_vote_fails() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let donor = Keypair::new();
        svm.airdrop(&donor.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_pk, &donor.pubkey(), LAMPORTS_PER_SOL),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                100_000_000,
                Pubkey::new_unique(),
                "x",
            ),
        )
        .unwrap();

        send(
            &mut svm,
            &donor,
            &[],
            build_vote_ix(&creator_pk, &donor.pubkey(), 0, true),
        )
        .expect("first vote ok");
        let result = send(
            &mut svm,
            &donor,
            &[],
            build_vote_ix(&creator_pk, &donor.pubkey(), 0, true),
        );
        assert!(result.is_err(), "second vote from same member must fail");
    }

    #[test]
    fn test_non_member_vote_fails() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                100_000_000,
                Pubkey::new_unique(),
                "y",
            ),
        )
        .unwrap();

        let stranger = Keypair::new();
        svm.airdrop(&stranger.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let result = send(
            &mut svm,
            &stranger,
            &[],
            build_vote_ix(&creator_pk, &stranger.pubkey(), 0, true),
        );
        assert!(result.is_err(), "non-member should not be able to vote");
    }

    #[test]
    fn test_execute_below_threshold() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 5, 0),
        )
        .unwrap();

        let donor = Keypair::new();
        svm.airdrop(&donor.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_pk, &donor.pubkey(), LAMPORTS_PER_SOL),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let recipient = Keypair::new();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                100_000_000,
                recipient.pubkey(),
                "z",
            ),
        )
        .unwrap();

        send(
            &mut svm,
            &donor,
            &[],
            build_vote_ix(&creator_pk, &donor.pubkey(), 0, true),
        )
        .unwrap();

        warp_clock_by(&mut svm, DEFAULT_VOTING_PERIOD + 5);

        let executor = Keypair::new();
        svm.airdrop(&executor.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let result = send(
            &mut svm,
            &executor,
            &[],
            build_execute_ix(&creator_pk, &executor.pubkey(), 0, recipient.pubkey()),
        );
        assert!(result.is_err(), "execute below threshold must fail");
    }

    #[test]
    fn test_execute_meets_threshold() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let donor = Keypair::new();
        svm.airdrop(&donor.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_pk, &donor.pubkey(), 2 * LAMPORTS_PER_SOL),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let recipient = Keypair::new();
        let amount = 750_000_000;
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                amount,
                recipient.pubkey(),
                "ok",
            ),
        )
        .unwrap();

        send(
            &mut svm,
            &donor,
            &[],
            build_vote_ix(&creator_pk, &donor.pubkey(), 0, true),
        )
        .unwrap();

        warp_clock_by(&mut svm, DEFAULT_VOTING_PERIOD + 5);

        let executor = Keypair::new();
        svm.airdrop(&executor.pubkey(), LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &executor,
            &[],
            build_execute_ix(&creator_pk, &executor.pubkey(), 0, recipient.pubkey()),
        )
        .expect("execute should succeed");

        let recipient_acc = svm.get_account(&recipient.pubkey()).expect("recipient");
        assert_eq!(recipient_acc.lamports, amount);
    }

    #[test]
    fn test_two_creators_independent_daos() {
        let (mut svm, payer) = setup_svm_with_program();

        let creator_a = Keypair::new();
        let creator_b = Keypair::new();
        svm.airdrop(&creator_a.pubkey(), 10 * LAMPORTS_PER_SOL)
            .unwrap();
        svm.airdrop(&creator_b.pubkey(), 10 * LAMPORTS_PER_SOL)
            .unwrap();
        let creator_a_pk = creator_a.pubkey();
        let creator_b_pk = creator_b.pubkey();

        send(
            &mut svm,
            &payer,
            &[&creator_a],
            build_initialize_ix(&creator_a_pk, 1, 0),
        )
        .expect("DAO_A init");
        send(
            &mut svm,
            &payer,
            &[&creator_b],
            build_initialize_ix(&creator_b_pk, 7, 100_000_000),
        )
        .expect("DAO_B init");

        let (dao_a, _) = derive_dao_pda(&creator_a_pk);
        let (dao_b, _) = derive_dao_pda(&creator_b_pk);
        assert_ne!(dao_a, dao_b, "two creators must yield distinct DAO PDAs");

        let donor = Keypair::new();
        svm.airdrop(&donor.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_a_pk, &donor.pubkey(), LAMPORTS_PER_SOL),
        )
        .expect("donate to DAO_A");

        let recipient = Keypair::new();
        let amount = 250_000_000;
        send(
            &mut svm,
            &donor,
            &[],
            build_create_application_ix(
                &creator_a_pk,
                &donor.pubkey(),
                0,
                amount,
                recipient.pubkey(),
                "DAO_A only",
            ),
        )
        .expect("create app in DAO_A");
        send(
            &mut svm,
            &donor,
            &[],
            build_vote_ix(&creator_a_pk, &donor.pubkey(), 0, true),
        )
        .expect("vote in DAO_A");

        warp_clock_by(&mut svm, DEFAULT_VOTING_PERIOD + 5);

        send(
            &mut svm,
            &donor,
            &[],
            build_execute_ix(&creator_a_pk, &donor.pubkey(), 0, recipient.pubkey()),
        )
        .expect("execute in DAO_A");

        let (treasury_b, _) = derive_treasury_pda(&dao_b);
        let treasury_b_acc = svm.get_account(&treasury_b);
        let lamports = treasury_b_acc.map(|a| a.lamports).unwrap_or(0);
        assert_eq!(lamports, 0, "DAO_B treasury must be untouched");

        svm.airdrop(&donor.pubkey(), 4 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_b_pk, &donor.pubkey(), 100_000_000),
        )
        .expect("donate to DAO_B (>= min_donation)");

        send(
            &mut svm,
            &donor,
            &[],
            build_create_application_ix(
                &creator_b_pk,
                &donor.pubkey(),
                0,
                10_000_000,
                Pubkey::new_unique(),
                "DAO_B id starts from 0",
            ),
        )
        .expect("DAO_B application id 0 must be available");

        let dup = send(
            &mut svm,
            &donor,
            &[],
            build_create_application_ix(
                &creator_a_pk,
                &donor.pubkey(),
                0,
                10_000_000,
                Pubkey::new_unique(),
                "should collide with existing id 0",
            ),
        );
        assert!(
            dup.is_err(),
            "DAO_A's id=0 PDA already taken; duplicate create must fail"
        );
    }

    #[test]
    fn test_same_creator_double_init_fails() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();

        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .expect("first init succeeds");

        let result = send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 2, 0),
        );
        assert!(
            result.is_err(),
            "same creator must not be able to init twice"
        );
    }

    #[test]
    fn test_cross_dao_resources_rejected() {
        let (mut svm, payer) = setup_svm_with_program();

        let creator_a = Keypair::new();
        let creator_b = Keypair::new();
        svm.airdrop(&creator_a.pubkey(), 10 * LAMPORTS_PER_SOL)
            .unwrap();
        svm.airdrop(&creator_b.pubkey(), 10 * LAMPORTS_PER_SOL)
            .unwrap();
        let creator_a_pk = creator_a.pubkey();
        let creator_b_pk = creator_b.pubkey();

        send(
            &mut svm,
            &payer,
            &[&creator_a],
            build_initialize_ix(&creator_a_pk, 1, 0),
        )
        .unwrap();
        send(
            &mut svm,
            &payer,
            &[&creator_b],
            build_initialize_ix(&creator_b_pk, 1, 0),
        )
        .unwrap();

        let voter = Keypair::new();
        svm.airdrop(&voter.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &voter,
            &[],
            build_donate_ix(&creator_a_pk, &voter.pubkey(), LAMPORTS_PER_SOL),
        )
        .unwrap();
        send(
            &mut svm,
            &voter,
            &[],
            build_donate_ix(&creator_b_pk, &voter.pubkey(), LAMPORTS_PER_SOL),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_a_pk,
                &proposer.pubkey(),
                0,
                100_000_000,
                Pubkey::new_unique(),
                "in DAO_A",
            ),
        )
        .unwrap();

        let result = send(
            &mut svm,
            &voter,
            &[],
            build_cross_dao_vote_ix(&creator_a_pk, &creator_b_pk, &voter.pubkey(), 0),
        );
        assert!(
            result.is_err(),
            "cross-DAO assembly must be rejected by seed constraint"
        );
    }

    // ============================================================
    // 新增：治理特性测试
    // ============================================================

    #[test]
    fn test_init_invalid_governance_params() {
        let (mut svm, _) = setup_svm_with_program();

        // quorum == 0
        let creator1 = Keypair::new();
        svm.airdrop(&creator1.pubkey(), 5 * LAMPORTS_PER_SOL)
            .unwrap();
        let r1 = send(
            &mut svm,
            &creator1,
            &[],
            build_initialize_ix_full(
                &creator1.pubkey(),
                fixed_bytes::<NAME_LEN>("d"),
                fixed_bytes::<DESCRIPTION_LEN>(""),
                fixed_bytes::<ICON_URI_LEN>(""),
                1,
                0,
                3600,
                0,
            ),
        );
        assert!(r1.is_err(), "quorum = 0 must be rejected");

        // voting_period < 60
        let creator2 = Keypair::new();
        svm.airdrop(&creator2.pubkey(), 5 * LAMPORTS_PER_SOL)
            .unwrap();
        let r2 = send(
            &mut svm,
            &creator2,
            &[],
            build_initialize_ix_full(
                &creator2.pubkey(),
                fixed_bytes::<NAME_LEN>("d"),
                fixed_bytes::<DESCRIPTION_LEN>(""),
                fixed_bytes::<ICON_URI_LEN>(""),
                1,
                1,
                30,
                0,
            ),
        );
        assert!(r2.is_err(), "voting_period < 60 must be rejected");

        // vote_threshold == 0
        let creator3 = Keypair::new();
        svm.airdrop(&creator3.pubkey(), 5 * LAMPORTS_PER_SOL)
            .unwrap();
        let r3 = send(
            &mut svm,
            &creator3,
            &[],
            build_initialize_ix_full(
                &creator3.pubkey(),
                fixed_bytes::<NAME_LEN>("d"),
                fixed_bytes::<DESCRIPTION_LEN>(""),
                fixed_bytes::<ICON_URI_LEN>(""),
                0,
                1,
                3600,
                0,
            ),
        );
        assert!(r3.is_err(), "vote_threshold = 0 must be rejected");
    }

    #[test]
    fn test_voting_period_expired_blocks_vote() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let donor = Keypair::new();
        svm.airdrop(&donor.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_pk, &donor.pubkey(), LAMPORTS_PER_SOL),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                100_000_000,
                Pubkey::new_unique(),
                "expired",
            ),
        )
        .unwrap();

        warp_clock_by(&mut svm, DEFAULT_VOTING_PERIOD + 5);

        let result = send(
            &mut svm,
            &donor,
            &[],
            build_vote_ix(&creator_pk, &donor.pubkey(), 0, true),
        );
        assert!(result.is_err(), "vote after voting_ends_at must fail");
    }

    #[test]
    fn test_voting_period_required_for_execute() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let donor = Keypair::new();
        svm.airdrop(&donor.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_pk, &donor.pubkey(), 2 * LAMPORTS_PER_SOL),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let recipient = Keypair::new();
        let amount = 100_000_000;
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                amount,
                recipient.pubkey(),
                "wait period",
            ),
        )
        .unwrap();

        send(
            &mut svm,
            &donor,
            &[],
            build_vote_ix(&creator_pk, &donor.pubkey(), 0, true),
        )
        .unwrap();

        // 投票期未结束 → 应失败
        let executor = Keypair::new();
        svm.airdrop(&executor.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let pre = send(
            &mut svm,
            &executor,
            &[],
            build_execute_ix(&creator_pk, &executor.pubkey(), 0, recipient.pubkey()),
        );
        assert!(
            pre.is_err(),
            "execute before voting_ends_at must fail (VotingNotEnded)"
        );

        // warp 后再 execute 应成功（同时 expire blockhash，避免重复签名 AlreadyProcessed）
        warp_clock_by(&mut svm, DEFAULT_VOTING_PERIOD + 5);
        svm.expire_blockhash();
        send(
            &mut svm,
            &executor,
            &[],
            build_execute_ix(&creator_pk, &executor.pubkey(), 0, recipient.pubkey()),
        )
        .expect("execute after voting_ends_at must succeed");
    }

    #[test]
    fn test_quorum_not_met_blocks_execute() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();

        // quorum = 5, threshold = 1, voting_period = 60
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix_full(
                &creator_pk,
                fixed_bytes::<NAME_LEN>("Q"),
                fixed_bytes::<DESCRIPTION_LEN>(""),
                fixed_bytes::<ICON_URI_LEN>(""),
                1,
                5,
                60,
                0,
            ),
        )
        .unwrap();

        let donor = Keypair::new();
        svm.airdrop(&donor.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_pk, &donor.pubkey(), LAMPORTS_PER_SOL),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let recipient = Keypair::new();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                100_000_000,
                recipient.pubkey(),
                "low turnout",
            ),
        )
        .unwrap();

        // 仅 1 票，远低于 quorum=5
        send(
            &mut svm,
            &donor,
            &[],
            build_vote_ix(&creator_pk, &donor.pubkey(), 0, true),
        )
        .unwrap();

        warp_clock_by(&mut svm, 65);

        let executor = Keypair::new();
        svm.airdrop(&executor.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let result = send(
            &mut svm,
            &executor,
            &[],
            build_execute_ix(&creator_pk, &executor.pubkey(), 0, recipient.pubkey()),
        );
        assert!(result.is_err(), "execute below quorum must fail");
    }

    #[test]
    fn test_against_outweighs_for_blocks_execute() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();

        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix_full(
                &creator_pk,
                fixed_bytes::<NAME_LEN>("A"),
                fixed_bytes::<DESCRIPTION_LEN>(""),
                fixed_bytes::<ICON_URI_LEN>(""),
                1,
                3,
                60,
                0,
            ),
        )
        .unwrap();

        // 5 个成员
        let mut members: Vec<Keypair> = Vec::new();
        for _ in 0..5 {
            let m = Keypair::new();
            svm.airdrop(&m.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
            send(
                &mut svm,
                &m,
                &[],
                build_donate_ix(&creator_pk, &m.pubkey(), LAMPORTS_PER_SOL),
            )
            .unwrap();
            members.push(m);
        }

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let recipient = Keypair::new();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                100_000_000,
                recipient.pubkey(),
                "controversial",
            ),
        )
        .unwrap();

        // 2 赞成 + 3 反对
        send(
            &mut svm,
            &members[0],
            &[],
            build_vote_ix(&creator_pk, &members[0].pubkey(), 0, true),
        )
        .unwrap();
        send(
            &mut svm,
            &members[1],
            &[],
            build_vote_ix(&creator_pk, &members[1].pubkey(), 0, true),
        )
        .unwrap();
        send(
            &mut svm,
            &members[2],
            &[],
            build_vote_ix(&creator_pk, &members[2].pubkey(), 0, false),
        )
        .unwrap();
        send(
            &mut svm,
            &members[3],
            &[],
            build_vote_ix(&creator_pk, &members[3].pubkey(), 0, false),
        )
        .unwrap();
        send(
            &mut svm,
            &members[4],
            &[],
            build_vote_ix(&creator_pk, &members[4].pubkey(), 0, false),
        )
        .unwrap();

        warp_clock_by(&mut svm, 65);

        let executor = Keypair::new();
        svm.airdrop(&executor.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let result = send(
            &mut svm,
            &executor,
            &[],
            build_execute_ix(&creator_pk, &executor.pubkey(), 0, recipient.pubkey()),
        );
        assert!(result.is_err(), "execute with against > for must fail");
    }

    #[test]
    fn test_against_equals_for_blocks_execute() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();

        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix_full(
                &creator_pk,
                fixed_bytes::<NAME_LEN>("T"),
                fixed_bytes::<DESCRIPTION_LEN>(""),
                fixed_bytes::<ICON_URI_LEN>(""),
                1,
                2,
                60,
                0,
            ),
        )
        .unwrap();

        let mut members: Vec<Keypair> = Vec::new();
        for _ in 0..2 {
            let m = Keypair::new();
            svm.airdrop(&m.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
            send(
                &mut svm,
                &m,
                &[],
                build_donate_ix(&creator_pk, &m.pubkey(), LAMPORTS_PER_SOL),
            )
            .unwrap();
            members.push(m);
        }

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let recipient = Keypair::new();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                100_000_000,
                recipient.pubkey(),
                "tie",
            ),
        )
        .unwrap();

        send(
            &mut svm,
            &members[0],
            &[],
            build_vote_ix(&creator_pk, &members[0].pubkey(), 0, true),
        )
        .unwrap();
        send(
            &mut svm,
            &members[1],
            &[],
            build_vote_ix(&creator_pk, &members[1].pubkey(), 0, false),
        )
        .unwrap();

        warp_clock_by(&mut svm, 65);

        let executor = Keypair::new();
        svm.airdrop(&executor.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let result = send(
            &mut svm,
            &executor,
            &[],
            build_execute_ix(&creator_pk, &executor.pubkey(), 0, recipient.pubkey()),
        );
        assert!(result.is_err(), "tie must not be treated as passing");
    }

    #[test]
    fn test_double_vote_against_after_for_fails() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let donor = Keypair::new();
        svm.airdrop(&donor.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_pk, &donor.pubkey(), LAMPORTS_PER_SOL),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                100_000_000,
                Pubkey::new_unique(),
                "switch direction?",
            ),
        )
        .unwrap();

        send(
            &mut svm,
            &donor,
            &[],
            build_vote_ix(&creator_pk, &donor.pubkey(), 0, true),
        )
        .unwrap();
        let r = send(
            &mut svm,
            &donor,
            &[],
            build_vote_ix(&creator_pk, &donor.pubkey(), 0, false),
        );
        assert!(r.is_err(), "cannot switch direction once voted");
    }

    #[test]
    fn test_cancel_by_proposer() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), 2 * LAMPORTS_PER_SOL)
            .unwrap();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                10_000_000,
                Pubkey::new_unique(),
                "self-cancel",
            ),
        )
        .unwrap();

        send(
            &mut svm,
            &proposer,
            &[],
            build_cancel_ix(&creator_pk, &proposer.pubkey(), 0),
        )
        .expect("proposer should cancel own pending proposal");

        // 取消后 vote 必失败
        let donor = Keypair::new();
        svm.airdrop(&donor.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_pk, &donor.pubkey(), LAMPORTS_PER_SOL),
        )
        .unwrap();
        let vote_after_cancel = send(
            &mut svm,
            &donor,
            &[],
            build_vote_ix(&creator_pk, &donor.pubkey(), 0, true),
        );
        assert!(
            vote_after_cancel.is_err(),
            "cannot vote on cancelled proposal"
        );
    }

    #[test]
    fn test_cancel_by_admin() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), 2 * LAMPORTS_PER_SOL)
            .unwrap();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                10_000_000,
                Pubkey::new_unique(),
                "admin-cancel",
            ),
        )
        .unwrap();

        send(
            &mut svm,
            &creator,
            &[],
            build_cancel_ix(&creator_pk, &creator_pk, 0),
        )
        .expect("admin should cancel any pending proposal");
    }

    #[test]
    fn test_cancel_by_other_fails() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), 2 * LAMPORTS_PER_SOL)
            .unwrap();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                10_000_000,
                Pubkey::new_unique(),
                "no-cancel",
            ),
        )
        .unwrap();

        let stranger = Keypair::new();
        svm.airdrop(&stranger.pubkey(), LAMPORTS_PER_SOL).unwrap();
        let r = send(
            &mut svm,
            &stranger,
            &[],
            build_cancel_ix(&creator_pk, &stranger.pubkey(), 0),
        );
        assert!(r.is_err(), "third party cannot cancel");
    }

    #[test]
    fn test_cancel_executed_fails() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let donor = Keypair::new();
        svm.airdrop(&donor.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_pk, &donor.pubkey(), 2 * LAMPORTS_PER_SOL),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), 2 * LAMPORTS_PER_SOL)
            .unwrap();
        let recipient = Keypair::new();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix(
                &creator_pk,
                &proposer.pubkey(),
                0,
                100_000_000,
                recipient.pubkey(),
                "exec-then-cancel",
            ),
        )
        .unwrap();

        send(
            &mut svm,
            &donor,
            &[],
            build_vote_ix(&creator_pk, &donor.pubkey(), 0, true),
        )
        .unwrap();

        warp_clock_by(&mut svm, DEFAULT_VOTING_PERIOD + 5);

        send(
            &mut svm,
            &donor,
            &[],
            build_execute_ix(&creator_pk, &donor.pubkey(), 0, recipient.pubkey()),
        )
        .unwrap();

        let r = send(
            &mut svm,
            &proposer,
            &[],
            build_cancel_ix(&creator_pk, &proposer.pubkey(), 0),
        );
        assert!(r.is_err(), "cannot cancel an already executed proposal");
    }

    #[test]
    fn test_update_metadata_by_admin() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix_full(
                &creator_pk,
                fixed_bytes::<NAME_LEN>("Old Name"),
                fixed_bytes::<DESCRIPTION_LEN>("Old desc"),
                fixed_bytes::<ICON_URI_LEN>("ipfs://old"),
                1,
                1,
                60,
                0,
            ),
        )
        .unwrap();

        let new_name: [u8; NAME_LEN] = fixed_bytes::<NAME_LEN>("Solana Scholar Fund");
        send(
            &mut svm,
            &creator,
            &[],
            build_update_metadata_ix(
                &creator_pk,
                &creator_pk,
                Some(new_name),
                None,
                None,
            ),
        )
        .expect("admin can update metadata");

        let (dao_pk, _) = derive_dao_pda(&creator_pk);
        let dao = read_dao(&svm, &dao_pk);
        assert_eq!(dao.name, new_name, "name should be updated");
        assert_eq!(
            dao.description,
            fixed_bytes::<DESCRIPTION_LEN>("Old desc"),
            "description preserved when None"
        );
        assert_eq!(
            dao.icon_uri,
            fixed_bytes::<ICON_URI_LEN>("ipfs://old"),
            "icon_uri preserved when None"
        );
    }

    #[test]
    fn test_update_metadata_by_non_admin_fails() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let stranger = Keypair::new();
        svm.airdrop(&stranger.pubkey(), 2 * LAMPORTS_PER_SOL)
            .unwrap();

        let r = send(
            &mut svm,
            &stranger,
            &[],
            build_update_metadata_ix(
                &creator_pk,
                &stranger.pubkey(),
                Some(fixed_bytes::<NAME_LEN>("Hijacked")),
                None,
                None,
            ),
        );
        assert!(r.is_err(), "non-admin must not update metadata");
    }

    #[test]
    fn test_donate_increments_member_count() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let (dao_pk, _) = derive_dao_pda(&creator_pk);
        assert_eq!(read_dao(&svm, &dao_pk).member_count, 0);

        let donor = Keypair::new();
        svm.airdrop(&donor.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_pk, &donor.pubkey(), LAMPORTS_PER_SOL),
        )
        .unwrap();
        assert_eq!(
            read_dao(&svm, &dao_pk).member_count,
            1,
            "first donation increments member_count"
        );

        // 同一钱包再次捐款不增加 member_count
        send(
            &mut svm,
            &donor,
            &[],
            build_donate_ix(&creator_pk, &donor.pubkey(), 200_000_000),
        )
        .unwrap();
        assert_eq!(
            read_dao(&svm, &dao_pk).member_count,
            1,
            "subsequent donation does not increment member_count"
        );

        // 不同钱包首次捐款 +1
        let donor2 = Keypair::new();
        svm.airdrop(&donor2.pubkey(), 5 * LAMPORTS_PER_SOL).unwrap();
        send(
            &mut svm,
            &donor2,
            &[],
            build_donate_ix(&creator_pk, &donor2.pubkey(), LAMPORTS_PER_SOL),
        )
        .unwrap();
        assert_eq!(read_dao(&svm, &dao_pk).member_count, 2);
    }

    // ============================================================
    // 新增：proof_cid 字段覆盖
    // ============================================================

    #[test]
    fn test_create_application_with_proof_cid() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), 2 * LAMPORTS_PER_SOL)
            .unwrap();
        let cid = "bafybeigdyrztktx5n3xq2ahkqjyf2u7m5e7r5q5q5q5q5q5q5q5q5q5q5q";
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix_with_proof(
                &creator_pk,
                &proposer.pubkey(),
                0,
                10_000_000,
                Pubkey::new_unique(),
                "with proof",
                cid,
            ),
        )
        .expect("create application with proof_cid should succeed");

        let (dao_pk, _) = derive_dao_pda(&creator_pk);
        let (app_pk, _) = derive_application_pda(&dao_pk, 0);
        let app = read_application(&svm, &app_pk);
        assert_eq!(app.proof_cid, cid, "proof_cid should round-trip exactly");
        assert_eq!(app.reason, "with proof");
        assert_eq!(app.status, ApplicationStatus::Pending);
    }

    #[test]
    fn test_create_application_without_proof_cid() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), 2 * LAMPORTS_PER_SOL)
            .unwrap();
        send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix_with_proof(
                &creator_pk,
                &proposer.pubkey(),
                0,
                10_000_000,
                Pubkey::new_unique(),
                "no proof",
                "",
            ),
        )
        .expect("empty proof_cid should be allowed for backward compatibility");

        let (dao_pk, _) = derive_dao_pda(&creator_pk);
        let (app_pk, _) = derive_application_pda(&dao_pk, 0);
        let app = read_application(&svm, &app_pk);
        assert_eq!(app.proof_cid, "", "proof_cid empty string preserved");
    }

    #[test]
    fn test_proof_cid_too_long_fails() {
        let (mut svm, creator) = setup_svm_with_program();
        let creator_pk = creator.pubkey();
        send(
            &mut svm,
            &creator,
            &[],
            build_initialize_ix(&creator_pk, 1, 0),
        )
        .unwrap();

        let proposer = Keypair::new();
        svm.airdrop(&proposer.pubkey(), 2 * LAMPORTS_PER_SOL)
            .unwrap();
        let oversize = "a".repeat(PROOF_CID_MAX_LEN + 1);
        let r = send(
            &mut svm,
            &proposer,
            &[],
            build_create_application_ix_with_proof(
                &creator_pk,
                &proposer.pubkey(),
                0,
                10_000_000,
                Pubkey::new_unique(),
                "oversized cid",
                &oversize,
            ),
        );
        assert!(
            r.is_err(),
            "proof_cid longer than PROOF_CID_MAX_LEN must fail"
        );
    }
}
