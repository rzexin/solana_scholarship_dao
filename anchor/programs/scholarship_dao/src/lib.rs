use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

#[cfg(test)]
mod tests;

declare_id!("9ARcMm246DgL41YDQTpvwGwwF1qCsi1zHm66hzdZKSE9");

pub const REASON_MAX_LEN: usize = 200;
pub const NAME_LEN: usize = 32;
pub const DESCRIPTION_LEN: usize = 128;
pub const ICON_URI_LEN: usize = 96;
pub const MIN_VOTING_PERIOD_SECONDS: i64 = 60;
pub const PROOF_CID_MAX_LEN: usize = 64;

#[program]
pub mod scholarship_dao {
    use super::*;

    pub fn initialize_dao(
        ctx: Context<InitializeDao>,
        dao_id: u64,
        name: [u8; NAME_LEN],
        description: [u8; DESCRIPTION_LEN],
        icon_uri: [u8; ICON_URI_LEN],
        vote_threshold: u16,
        quorum: u16,
        voting_period: i64,
        min_donation: u64,
    ) -> Result<()> {
        require!(
            vote_threshold >= 1 && quorum >= 1 && voting_period >= MIN_VOTING_PERIOD_SECONDS,
            ScholarshipError::InvalidGovernanceParams
        );

        let creator_key = ctx.accounts.creator.key();
        let dao = &mut ctx.accounts.dao;
        dao.creator = creator_key;
        dao.admin = creator_key;
        dao.dao_id = dao_id;
        dao.vote_threshold = vote_threshold;
        dao.quorum = quorum;
        dao.voting_period = voting_period;
        dao.min_donation = min_donation;
        dao.application_count = 0;
        dao.member_count = 0;
        dao.name = name;
        dao.description = description;
        dao.icon_uri = icon_uri;
        dao.bump = ctx.bumps.dao;

        emit!(DaoInitialized {
            dao: dao.key(),
            creator: creator_key,
            admin: creator_key,
            dao_id,
            vote_threshold,
            quorum,
            voting_period,
            min_donation,
        });

        Ok(())
    }

    pub fn donate(ctx: Context<Donate>, amount: u64) -> Result<()> {
        let dao_min_donation = ctx.accounts.dao.min_donation;
        require!(
            amount >= dao_min_donation,
            ScholarshipError::DonationTooSmall
        );

        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.donor.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            amount,
        )?;

        let member = &mut ctx.accounts.member;
        let now = Clock::get()?.unix_timestamp;
        let is_new_member = member.wallet == Pubkey::default();
        if is_new_member {
            member.wallet = ctx.accounts.donor.key();
            member.joined_at = now;
            member.bump = ctx.bumps.member;
            member.total_donated = 0;
        }
        member.total_donated = member
            .total_donated
            .checked_add(amount)
            .ok_or(ScholarshipError::AmountOverflow)?;
        let new_total = member.total_donated;

        if is_new_member {
            let dao = &mut ctx.accounts.dao;
            dao.member_count = dao
                .member_count
                .checked_add(1)
                .ok_or(ScholarshipError::AmountOverflow)?;
        }

        emit!(Donated {
            dao: ctx.accounts.dao.key(),
            donor: ctx.accounts.donor.key(),
            amount,
            total_donated: new_total,
        });

        Ok(())
    }

    pub fn create_application(
        ctx: Context<CreateApplication>,
        amount: u64,
        recipient: Pubkey,
        reason: String,
        proof_cid: String,
    ) -> Result<()> {
        require!(amount > 0, ScholarshipError::AmountMustBePositive);
        require!(
            reason.len() <= REASON_MAX_LEN,
            ScholarshipError::ReasonTooLong
        );
        require!(
            proof_cid.len() <= PROOF_CID_MAX_LEN,
            ScholarshipError::ProofCidTooLong
        );

        let dao_key = ctx.accounts.dao.key();
        let voting_period = ctx.accounts.dao.voting_period;
        let dao = &mut ctx.accounts.dao;
        let id = dao.application_count;
        dao.application_count = dao
            .application_count
            .checked_add(1)
            .ok_or(ScholarshipError::AmountOverflow)?;

        let now = Clock::get()?.unix_timestamp;
        let voting_ends_at = now
            .checked_add(voting_period)
            .ok_or(ScholarshipError::AmountOverflow)?;

        let application = &mut ctx.accounts.application;
        application.id = id;
        application.dao = dao_key;
        application.proposer = ctx.accounts.proposer.key();
        application.recipient = recipient;
        application.amount = amount;
        application.reason = reason;
        application.proof_cid = proof_cid;
        application.votes_for = 0;
        application.votes_against = 0;
        application.status = ApplicationStatus::Pending;
        application.created_at = now;
        application.voting_ends_at = voting_ends_at;
        application.bump = ctx.bumps.application;

        emit!(ApplicationCreated {
            dao: dao_key,
            id,
            proposer: application.proposer,
            recipient,
            amount,
            voting_ends_at,
        });

        Ok(())
    }

    pub fn vote(ctx: Context<Vote>, application_id: u64, support: bool) -> Result<()> {
        let _ = application_id;
        let now = Clock::get()?.unix_timestamp;
        let application = &mut ctx.accounts.application;
        require!(
            application.status == ApplicationStatus::Pending,
            ScholarshipError::ApplicationNotPending
        );
        require!(
            now <= application.voting_ends_at,
            ScholarshipError::VotingEnded
        );

        let vote_record = &mut ctx.accounts.vote_record;
        vote_record.bump = ctx.bumps.vote_record;
        vote_record.support = support;

        if support {
            application.votes_for = application
                .votes_for
                .checked_add(1)
                .ok_or(ScholarshipError::AmountOverflow)?;
        } else {
            application.votes_against = application
                .votes_against
                .checked_add(1)
                .ok_or(ScholarshipError::AmountOverflow)?;
        }

        emit!(Voted {
            dao: ctx.accounts.dao.key(),
            application_id: application.id,
            voter: ctx.accounts.voter.key(),
            support,
            votes_for: application.votes_for,
            votes_against: application.votes_against,
        });

        Ok(())
    }

    pub fn execute(ctx: Context<Execute>, application_id: u64) -> Result<()> {
        let _ = application_id;
        let now = Clock::get()?.unix_timestamp;
        let dao = &ctx.accounts.dao;
        let application = &mut ctx.accounts.application;
        let treasury = &ctx.accounts.treasury;

        require!(
            application.status == ApplicationStatus::Pending,
            ScholarshipError::ApplicationNotPending
        );
        require!(
            now >= application.voting_ends_at,
            ScholarshipError::VotingNotEnded
        );

        let total_votes = (application.votes_for as u32)
            .checked_add(application.votes_against as u32)
            .ok_or(ScholarshipError::AmountOverflow)?;
        require!(
            total_votes >= dao.quorum as u32,
            ScholarshipError::QuorumNotMet
        );
        require!(
            application.votes_for > application.votes_against,
            ScholarshipError::VoteAgainstWins
        );
        require!(
            application.votes_for >= dao.vote_threshold,
            ScholarshipError::ThresholdNotMet
        );
        require!(
            treasury.lamports() >= application.amount,
            ScholarshipError::InsufficientTreasury
        );
        require_keys_eq!(
            ctx.accounts.recipient.key(),
            application.recipient,
            ScholarshipError::RecipientMismatch
        );

        let dao_key = dao.key();
        let bump = ctx.bumps.treasury;
        let signer_seeds: &[&[&[u8]]] = &[&[b"treasury", dao_key.as_ref(), &[bump]]];

        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: treasury.to_account_info(),
                    to: ctx.accounts.recipient.to_account_info(),
                },
                signer_seeds,
            ),
            application.amount,
        )?;

        application.status = ApplicationStatus::Executed;

        emit!(ApplicationExecuted {
            dao: dao_key,
            id: application.id,
            recipient: application.recipient,
            amount: application.amount,
        });

        Ok(())
    }

    pub fn cancel_application(ctx: Context<CancelApplication>, application_id: u64) -> Result<()> {
        let _ = application_id;
        let dao = &ctx.accounts.dao;
        let signer_key = ctx.accounts.signer.key();
        let application = &mut ctx.accounts.application;

        require!(
            application.status == ApplicationStatus::Pending,
            ScholarshipError::ApplicationNotPending
        );
        require!(
            signer_key == application.proposer || signer_key == dao.admin,
            ScholarshipError::NotProposerOrAdmin
        );

        application.status = ApplicationStatus::Cancelled;

        emit!(ApplicationCancelled {
            dao: dao.key(),
            id: application.id,
            by: signer_key,
        });

        Ok(())
    }

    pub fn update_dao_metadata(
        ctx: Context<UpdateDaoMetadata>,
        name: Option<[u8; NAME_LEN]>,
        description: Option<[u8; DESCRIPTION_LEN]>,
        icon_uri: Option<[u8; ICON_URI_LEN]>,
    ) -> Result<()> {
        let dao = &mut ctx.accounts.dao;
        if let Some(value) = name {
            dao.name = value;
        }
        if let Some(value) = description {
            dao.description = value;
        }
        if let Some(value) = icon_uri {
            dao.icon_uri = value;
        }

        emit!(DaoMetadataUpdated {
            dao: dao.key(),
            by: ctx.accounts.admin.key(),
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(dao_id: u64)]
pub struct InitializeDao<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + Dao::INIT_SPACE,
        seeds = [b"dao", creator.key().as_ref(), &dao_id.to_le_bytes()],
        bump,
    )]
    pub dao: Account<'info, Dao>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Donate<'info> {
    #[account(mut)]
    pub donor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"dao", dao.creator.as_ref(), &dao.dao_id.to_le_bytes()],
        bump = dao.bump,
    )]
    pub dao: Account<'info, Dao>,

    /// CHECK: Treasury 是 PDA 持有的 SystemAccount，按 DAO 隔离持币，由 seeds + bump 校验
    #[account(
        mut,
        seeds = [b"treasury", dao.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    #[account(
        init_if_needed,
        payer = donor,
        space = 8 + Member::INIT_SPACE,
        seeds = [b"member", dao.key().as_ref(), donor.key().as_ref()],
        bump,
    )]
    pub member: Account<'info, Member>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, recipient: Pubkey, reason: String, proof_cid: String)]
pub struct CreateApplication<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"dao", dao.creator.as_ref(), &dao.dao_id.to_le_bytes()],
        bump = dao.bump,
    )]
    pub dao: Account<'info, Dao>,

    #[account(
        init,
        payer = proposer,
        space = 8 + Application::space(reason.len(), proof_cid.len()),
        seeds = [
            b"app".as_ref(),
            dao.key().as_ref(),
            dao.application_count.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub application: Account<'info, Application>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(application_id: u64)]
pub struct Vote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,

    #[account(
        seeds = [b"dao", dao.creator.as_ref(), &dao.dao_id.to_le_bytes()],
        bump = dao.bump,
    )]
    pub dao: Account<'info, Dao>,

    #[account(
        seeds = [b"member", dao.key().as_ref(), voter.key().as_ref()],
        bump = member.bump,
        constraint = member.wallet == voter.key() @ ScholarshipError::NotAMember,
    )]
    pub member: Account<'info, Member>,

    #[account(
        mut,
        seeds = [
            b"app".as_ref(),
            dao.key().as_ref(),
            application_id.to_le_bytes().as_ref(),
        ],
        bump = application.bump,
    )]
    pub application: Account<'info, Application>,

    #[account(
        init,
        payer = voter,
        space = 8 + VoteRecord::INIT_SPACE,
        seeds = [b"vote", application.key().as_ref(), member.key().as_ref()],
        bump,
    )]
    pub vote_record: Account<'info, VoteRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(application_id: u64)]
pub struct Execute<'info> {
    #[account(mut)]
    pub executor: Signer<'info>,

    #[account(
        seeds = [b"dao", dao.creator.as_ref(), &dao.dao_id.to_le_bytes()],
        bump = dao.bump,
    )]
    pub dao: Account<'info, Dao>,

    #[account(
        mut,
        seeds = [b"treasury", dao.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [
            b"app".as_ref(),
            dao.key().as_ref(),
            application_id.to_le_bytes().as_ref(),
        ],
        bump = application.bump,
    )]
    pub application: Account<'info, Application>,

    /// CHECK: 由 application.recipient 校验地址一致性，无需读取数据
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(application_id: u64)]
pub struct CancelApplication<'info> {
    pub signer: Signer<'info>,

    #[account(
        seeds = [b"dao", dao.creator.as_ref(), &dao.dao_id.to_le_bytes()],
        bump = dao.bump,
    )]
    pub dao: Account<'info, Dao>,

    #[account(
        mut,
        seeds = [
            b"app".as_ref(),
            dao.key().as_ref(),
            application_id.to_le_bytes().as_ref(),
        ],
        bump = application.bump,
    )]
    pub application: Account<'info, Application>,
}

#[derive(Accounts)]
pub struct UpdateDaoMetadata<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [b"dao", dao.creator.as_ref(), &dao.dao_id.to_le_bytes()],
        bump = dao.bump,
        has_one = admin @ ScholarshipError::NotProposerOrAdmin,
    )]
    pub dao: Account<'info, Dao>,
}

#[account]
#[derive(InitSpace)]
pub struct Dao {
    pub creator: Pubkey,
    pub admin: Pubkey,
    pub dao_id: u64,
    pub vote_threshold: u16,
    pub quorum: u16,
    pub voting_period: i64,
    pub min_donation: u64,
    pub application_count: u64,
    pub member_count: u32,
    pub name: [u8; NAME_LEN],
    pub description: [u8; DESCRIPTION_LEN],
    pub icon_uri: [u8; ICON_URI_LEN],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Member {
    pub wallet: Pubkey,
    pub total_donated: u64,
    pub joined_at: i64,
    pub bump: u8,
}

#[account]
pub struct Application {
    pub id: u64,
    pub dao: Pubkey,
    pub proposer: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub votes_for: u16,
    pub votes_against: u16,
    pub status: ApplicationStatus,
    pub created_at: i64,
    pub voting_ends_at: i64,
    pub bump: u8,
    pub reason: String,
    pub proof_cid: String,
}

impl Application {
    pub fn space(reason_len: usize, proof_cid_len: usize) -> usize {
        8 // id
        + 32 // dao
        + 32 // proposer
        + 32 // recipient
        + 8 // amount
        + 2 // votes_for
        + 2 // votes_against
        + 1 // status enum (1 byte tag, no data)
        + 8 // created_at
        + 8 // voting_ends_at
        + 1 // bump
        + 4 + reason_len // String prefix + content
        + 4 + proof_cid_len // proof_cid String prefix + content
    }
}

#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub bump: u8,
    pub support: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ApplicationStatus {
    Pending,
    Executed,
    Cancelled,
}

#[event]
pub struct DaoInitialized {
    pub dao: Pubkey,
    pub creator: Pubkey,
    pub admin: Pubkey,
    pub dao_id: u64,
    pub vote_threshold: u16,
    pub quorum: u16,
    pub voting_period: i64,
    pub min_donation: u64,
}

#[event]
pub struct Donated {
    pub dao: Pubkey,
    pub donor: Pubkey,
    pub amount: u64,
    pub total_donated: u64,
}

#[event]
pub struct ApplicationCreated {
    pub dao: Pubkey,
    pub id: u64,
    pub proposer: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub voting_ends_at: i64,
}

#[event]
pub struct Voted {
    pub dao: Pubkey,
    pub application_id: u64,
    pub voter: Pubkey,
    pub support: bool,
    pub votes_for: u16,
    pub votes_against: u16,
}

#[event]
pub struct ApplicationExecuted {
    pub dao: Pubkey,
    pub id: u64,
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ApplicationCancelled {
    pub dao: Pubkey,
    pub id: u64,
    pub by: Pubkey,
}

#[event]
pub struct DaoMetadataUpdated {
    pub dao: Pubkey,
    pub by: Pubkey,
}

#[error_code]
pub enum ScholarshipError {
    #[msg("This wallet has already created a DAO.")]
    AlreadyInitialized,
    #[msg("Donation amount is below the minimum required by the DAO.")]
    DonationTooSmall,
    #[msg("Caller is not a registered DAO member; donate first to join.")]
    NotAMember,
    #[msg("Reason text exceeds the maximum allowed length (200 chars).")]
    ReasonTooLong,
    #[msg("Application amount must be greater than zero.")]
    AmountMustBePositive,
    #[msg("Application is no longer in the Pending state.")]
    ApplicationNotPending,
    #[msg("Vote count has not yet reached the configured threshold.")]
    ThresholdNotMet,
    #[msg("Treasury balance is insufficient to cover the requested amount.")]
    InsufficientTreasury,
    #[msg("Provided recipient does not match the application recipient.")]
    RecipientMismatch,
    #[msg("Numeric overflow detected.")]
    AmountOverflow,
    #[msg("Governance parameters are invalid (vote_threshold/quorum must be >= 1, voting_period must be >= 60s).")]
    InvalidGovernanceParams,
    #[msg("Total votes have not reached the configured quorum.")]
    QuorumNotMet,
    #[msg("Against votes outweigh (or equal) the for votes; proposal cannot be executed.")]
    VoteAgainstWins,
    #[msg("Voting period has already ended for this application.")]
    VotingEnded,
    #[msg("Voting period has not yet ended; cannot execute.")]
    VotingNotEnded,
    #[msg("Caller is neither the application proposer nor the DAO admin.")]
    NotProposerOrAdmin,
    #[msg("Proof CID exceeds the maximum allowed length (64 chars).")]
    ProofCidTooLong,
}
