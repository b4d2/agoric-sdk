// @ts-check
import { assert } from '@agoric/assert';
import { AmountMath } from '@agoric/ertp';
import { Nat } from '@agoric/nat';
import {
  natSafeMath,
  makeRatio,
} from '@agoric/zoe/src/contractSupport/index.js';
import { E } from '@endo/far';

const { multiply, floorDivide } = natSafeMath;
const { entries } = Object;

export const CENTRAL_ISSUER_NAME = 'RUN';
const CENTRAL_DENOM_NAME = 'urun';

const DecimalPlaces = {
  ATOM: 6,
  WETH: 18,
  LINK: 18,
  USDC: 18,
};

/** @type {Record<string, { petName: string, balance: bigint}>} */
const FaucetPurseDetail = {
  LINK: { petName: 'Oracle fee', balance: 51n },
  USDC: { petName: 'USD Coin', balance: 1_323n },
};

const FakePurseDetail = {
  ATOM: { petName: 'Cosmos Staking', balance: 68n },
  moola: { petName: 'Fun budget', balance: 1900n },
  simolean: { petName: 'Nest egg', balance: 970n },
};

const PCT = 100n;
const BASIS = 10_000n;

/**
 * @typedef {[bigint, bigint]} Rational
 *
 * @type { Record<string, {
 *   config?: {
 *     collateralValue: bigint,
 *     initialMargin: Rational,
 *     liquidationMargin: Rational,
 *     interestRate: Rational,
 *     loanFee: Rational,
 *   },
 *   trades: Array<{ central: number, collateral: number}>
 * }>}
 */
const AMMDemoState = {
  /* We actually can IBC-transfer Atoms via Pegasus right now. */
  ATOM: {
    config: {
      collateralValue: 1_000_000n,
      initialMargin: [150n, PCT],
      liquidationMargin: [125n, PCT],
      interestRate: [250n, BASIS],
      loanFee: [1n, BASIS],
    },
    trades: [
      { central: 33.28, collateral: 1 },
      { central: 34.61, collateral: 1 },
      { central: 37.83, collateral: 1 },
    ],
  },

  WETH: {
    config: {
      collateralValue: 1_000_000n,
      initialMargin: [150n, PCT],
      liquidationMargin: [125n, PCT],
      interestRate: [250n, BASIS],
      loanFee: [1n, BASIS],
    },
    trades: [
      { central: 3286.01, collateral: 1 },
      { central: 3435.86, collateral: 1 },
      { central: 3443.21, collateral: 1 },
    ],
  },

  LINK: {
    config: {
      collateralValue: 1_000_000n,
      initialMargin: [150n, PCT],
      liquidationMargin: [125n, PCT],
      interestRate: [250n, BASIS],
      loanFee: [1n, BASIS],
    },
    trades: [
      { central: 26.9, collateral: 1 },
      { central: 30.59, collateral: 1 },
      { central: 30.81, collateral: 1 },
    ],
  },

  USDC: {
    config: {
      collateralValue: 10_000_000n,
      initialMargin: [150n, PCT],
      liquidationMargin: [125n, PCT],
      interestRate: [250n, BASIS],
      loanFee: [1n, BASIS],
    },
    trades: [{ central: 1, collateral: 1 }],
  },

  moola: {
    trades: [
      { central: 1, collateral: 1 },
      { central: 1.3, collateral: 1 },
      { central: 1.2, collateral: 1 },
      { central: 1.8, collateral: 1 },
      { central: 1.5, collateral: 1 },
    ],
  },

  simolean: {
    trades: [
      { central: 21.35, collateral: 1 },
      { central: 21.72, collateral: 1 },
      { central: 21.24, collateral: 1 },
    ],
  },
};

/** @type {[string, IssuerInitializationRecord]} */
const BLD_ISSUER_ENTRY = [
  'BLD',
  {
    issuerArgs: [undefined, { decimalPlaces: 6 }],
    defaultPurses: [['Agoric staking token', scaleMicro(5000)]],
    bankDenom: 'ubld',
    bankPurse: 'Agoric staking token',
    tradesGivenCentral: [
      [scaleCentral(1.23, 2), scaleMicro(1)],
      [scaleCentral(1.21, 2), scaleMicro(1)],
      [scaleCentral(1.22, 2), scaleMicro(1)],
    ],
  },
];
harden(BLD_ISSUER_ENTRY);
export { BLD_ISSUER_ENTRY };

/** @type {(centralRecord: Partial<IssuerInitializationRecord>) => Array<[string, IssuerInitializationRecord]>} */
const fromCosmosIssuerEntries = centralRecord => [
  [
    CENTRAL_ISSUER_NAME,
    {
      issuerArgs: [undefined, { decimalPlaces: 6 }],
      defaultPurses: [['Agoric RUN currency', scaleMicro(53)]],
      bankPurse: 'Agoric RUN currency',
      tradesGivenCentral: [[1n, 1n]],
      ...centralRecord,
    },
  ],
  BLD_ISSUER_ENTRY,
];
harden(fromCosmosIssuerEntries);

/**
 * Note that we can still add these fake currencies to be traded on the AMM.
 * Just don't add a defaultPurses entry if you don't want them to be given out
 * on bootstrap.  They might still be tradable on the AMM.
 *
 * @param {boolean} noObviouslyFakeCurrencies
 * @returns {Array<[string, IssuerInitializationRecord]>}
 */

/** @param { BootstrapPowers } powers */
export const addBankAssets = async ({ consume: { bankManager } }) => {
  // Add bank assets.
  await Promise.all(
    issuerEntries.map(async entry => {
      const [issuerName, record] = entry;
      const { bankDenom, bankPurse, brand, issuer, bankPayment } = record;
      if (!bankDenom || !bankPurse) {
        return undefined;
      }

      assert(brand);
      assert(issuer);

      const makeMintKit = async () => {
        // We need to obtain the mint in order to mint the tokens when they
        // come from the bank.
        // FIXME: Be more careful with the mint.
        const mint = await E(vats.mints).getMint(issuerName);
        return harden({ brand, issuer, mint });
      };

      let kitP;
      if (bankBridgeManager && bankPayment) {
        // The bank needs the payment to back its existing bridge peg.
        kitP = harden({ brand, issuer, payment: bankPayment });
      } else if (unusedBankPayments.has(brand)) {
        // No need to back the currency.
        kitP = harden({ brand, issuer });
      } else {
        kitP = makeMintKit();
      }

      const kit = await kitP;
      return E(bankManager).addAsset(bankDenom, issuerName, bankPurse, kit);
    }),
  );
};
harden(addBankAssets);

/**
 * @param { BootstrapPowers & {
 *   vatParameters: { argv: { bootMsg?: typeof bootMsgEx }}
 * }} powers
 */
export const renameMe = async ({
  vatParameters: {
    argv: { bootMsg, noFakeCurrencies },
  },
  consume: { zoe, agoricNames },
}) => {
  const demoIssuers = demoIssuerEntries(noFakeCurrencies);
  // all the non=RUN issuers. RUN can't be initialized until we have the
  // bootstrap payment, but we need to know pool sizes to ask for that.
  const demoAndBldIssuers = [...demoIssuers, BLD_ISSUER_ENTRY];

  /** @param { bigint } n */
  const inCentral = n => n * 10n ** DecimalPlaces[CENTRAL_ISSUER_NAME];

  /**
   * Calculate how much RUN we need to fund the AMM pools
   *
   * @param {typeof AMMDemoState} issuers
   * @returns
   */
  function ammPoolRunDeposits(issuers) {
    let ammTotal = 0n;
    const ammPoolIssuers = /** @type {string[]} */ ([]);
    const ammPoolBalances = /** @type {bigint[]} */ ([]);
    entries(issuers).forEach(([issuerName, record]) => {
      if (!record.config) {
        // skip RUN and fake issuers
        return;
      }
      assert(record.trades);

      /** @param { bigint } n */
      const inCollateral = n => n * 10n ** DecimalPlaces[issuerName];

      // The initial trade represents the fair value of RUN for collateral.
      const initialTrade = record.trades[0];
      // The collateralValue to be deposited is given, and we want to deposit
      // the same value of RUN in the pool. For instance, We're going to
      // deposit 2 * 10^13 BLD, and 10^6 build will trade for 28.9 * 10^6 RUN
      const poolBalance = floorDivide(
        multiply(
          inCollateral(record.config.collateralValue),
          inCentral(BigInt(initialTrade.central)),
        ),
        inCollateral(BigInt(initialTrade.collateral)),
      );
      ammTotal += poolBalance;
      ammPoolIssuers.push(issuerName);
      ammPoolBalances.push(poolBalance);
    });
    return {
      ammTotal,
      ammPoolBalances,
      ammPoolIssuers,
    };
  }

  const {
    ammTotal: ammDepositValue,
    ammPoolBalances,
    ammPoolIssuers,
  } = ammPoolRunDeposits(AMMDemoState);

  const { supplyCoins = [] } = bootMsg || {};

  const centralBootstrapSupply = supplyCoins.find(
    ({ denom }) => denom === CENTRAL_DENOM_NAME,
  ) || { amount: '0' };

  // Now we can bootstrap the economy!
  const bankBootstrapSupply = Nat(BigInt(centralBootstrapSupply.amount));
  // Ask the vaultFactory for enough RUN to fund both AMM and bank.
  const bootstrapPaymentValue = bankBootstrapSupply + ammDepositValue;
  // NOTE: no use of the voteCreator. We'll need it to initiate votes on
  // changing VaultFactory parameters.
  const { vaultFactoryCreator, _voteCreator, ammFacets } = await installEconomy(
    bootstrapPaymentValue,
  );

  const [
    centralIssuer,
    centralBrand,
    ammInstance,
    pegasusInstance,
  ] = await Promise.all([
    E(agoricNames).lookup('issuer', CENTRAL_ISSUER_NAME),
    E(agoricNames).lookup('brand', CENTRAL_ISSUER_NAME),
    E(agoricNames).lookup('instance', 'amm'),
    E(agoricNames).lookup('instance', 'Pegasus'),
  ]);

  /**
   * @type {Store<Brand, Payment>} A store containing payments that weren't
   * used by the bank and can be used for other purposes.
   */
  const unusedBankPayments = makeStore('brand');

  /* Prime the bank vat with our bootstrap payment. */
  const centralBootstrapPayment = await E(
    vaultFactoryCreator,
  ).getBootstrapPayment(AmountMath.make(centralBrand, bootstrapPaymentValue));

  const [ammBootstrapPayment, bankBootstrapPayment] = await E(
    centralIssuer,
  ).split(
    centralBootstrapPayment,
    AmountMath.make(centralBrand, ammDepositValue),
  );

  // If there's no bankBridgeManager, we'll find other uses for these funds.
  if (!bankBridgeManager) {
    unusedBankPayments.init(centralBrand, bankBootstrapPayment);
  }

  /** @type {Array<[string, IssuerInitializationRecord]>} */
  const rawIssuerEntries = [
    ...fromCosmosIssuerEntries({
      issuer: centralIssuer,
      brand: centralBrand,
      bankDenom: CENTRAL_DENOM_NAME,
      bankPayment: bankBootstrapPayment,
    }),
    // We still create demo currencies, but not obviously fake ones unless
    // $FAKE_CURRENCIES is given.
    ...demoIssuers,
  ];

  const issuerEntries = await Promise.all(
    rawIssuerEntries.map(async entry => {
      const [issuerName, record] = entry;
      if (record.issuer !== undefined) {
        return entry;
      }
      /** @type {Issuer} */
      const issuer = await E(vats.mints).makeMintAndIssuer(
        issuerName,
        ...(record.issuerArgs || []),
      );
      const brand = await E(issuer).getBrand();

      const newRecord = harden({ ...record, brand, issuer });

      /** @type {[string, typeof newRecord]} */
      const newEntry = [issuerName, newRecord];
      return newEntry;
    }),
  );

  async function addAllCollateral() {
    async function splitAllCentralPayments() {
      const ammPoolAmounts = ammPoolBalances.map(b =>
        AmountMath.make(centralBrand, b),
      );

      const allPayments = await E(centralIssuer).splitMany(
        ammBootstrapPayment,
        ammPoolAmounts,
      );

      const issuerMap = {};
      for (let i = 0; i < ammPoolBalances.length; i += 1) {
        const issuerName = ammPoolIssuers[i];
        issuerMap[issuerName] = {
          payment: allPayments[i],
          amount: ammPoolAmounts[i],
        };
      }
      return issuerMap;
    }

    const issuerMap = await splitAllCentralPayments();

    return Promise.all(
      issuerEntries.map(async entry => {
        const [issuerName, record] = entry;
        const config = record.collateralConfig;
        if (!config) {
          return undefined;
        }
        assert(record.tradesGivenCentral);
        const initialPrice = record.tradesGivenCentral[0];
        assert(initialPrice);
        const initialPriceNumerator = /** @type {bigint} */ (initialPrice[0]);
        const rates = {
          initialPrice: makeRatio(
            initialPriceNumerator,
            centralBrand,
            /** @type {bigint} */ (initialPrice[1]),
            record.brand,
          ),
          initialMargin: makeRatio(config.initialMarginPercent, centralBrand),
          liquidationMargin: makeRatio(
            config.liquidationMarginPercent,
            centralBrand,
          ),
          interestRate: makeRatio(
            config.interestRateBasis,
            centralBrand,
            BASIS_POINTS_DENOM,
          ),
          loanFee: makeRatio(
            config.loanFeeBasis,
            centralBrand,
            BASIS_POINTS_DENOM,
          ),
        };

        const collateralPayments = E(vats.mints).mintInitialPayments(
          [issuerName],
          [config.collateralValue],
        );
        const secondaryPayment = E.get(collateralPayments)[0];

        assert(record.issuer, `No issuer for ${issuerName}`);
        const liquidityIssuer = E(ammFacets.ammPublicFacet).addPool(
          record.issuer,
          config.keyword,
        );
        const [secondaryAmount, liquidityBrand] = await Promise.all([
          E(record.issuer).getAmountOf(secondaryPayment),
          E(liquidityIssuer).getBrand(),
        ]);
        const centralAmount = issuerMap[issuerName].amount;
        const proposal = harden({
          want: { Liquidity: AmountMath.makeEmpty(liquidityBrand) },
          give: { Secondary: secondaryAmount, Central: centralAmount },
        });

        E(zoe).offer(
          E(ammFacets.ammPublicFacet).makeAddLiquidityInvitation(),
          proposal,
          harden({
            Secondary: secondaryPayment,
            Central: issuerMap[issuerName].payment,
          }),
        );

        return E(vaultFactoryCreator).addVaultType(
          record.issuer,
          config.keyword,
          rates,
        );
      }),
    );
  }

  /**
   * @param {ERef<Issuer>} issuerIn
   * @param {ERef<Issuer>} issuerOut
   * @param {ERef<Brand>} brandIn
   * @param {ERef<Brand>} brandOut
   * @param {Array<[bigint | number, bigint | number]>} tradeList
   */
  const makeFakePriceAuthority = (
    issuerIn,
    issuerOut,
    brandIn,
    brandOut,
    tradeList,
  ) =>
    E(vats.priceAuthority).makeFakePriceAuthority({
      issuerIn,
      issuerOut,
      actualBrandIn: brandIn,
      actualBrandOut: brandOut,
      tradeList,
      timer: chainTimerService,
      quoteInterval: QUOTE_INTERVAL,
    });

  await addAllCollateral();

  const brandsWithPriceAuthorities = await E(ammPublicFacet).getAllPoolBrands();

  await Promise.all(
    issuerEntries.map(async entry => {
      // Create priceAuthority pairs for centralIssuer based on the
      // AMM or FakePriceAuthority.
      const [issuerName, record] = entry;
      console.debug(`Creating ${issuerName}-${CENTRAL_ISSUER_NAME}`);
      const { tradesGivenCentral, issuer } = record;

      assert(issuer);
      const brand = await E(issuer).getBrand();
      let toCentral;
      let fromCentral;

      if (brandsWithPriceAuthorities.includes(brand)) {
        ({ toCentral, fromCentral } = await E(ammPublicFacet)
          .getPriceAuthorities(brand)
          .catch(_e => {
            // console.warn('could not get AMM priceAuthorities', _e);
            return {};
          }));
      }

      if (!fromCentral && tradesGivenCentral) {
        // We have no amm from-central price authority, make one from trades.
        if (issuerName !== CENTRAL_ISSUER_NAME) {
          console.log(
            `Making fake price authority for ${CENTRAL_ISSUER_NAME}-${issuerName}`,
          );
        }
        fromCentral = makeFakePriceAuthority(
          centralIssuer,
          issuer,
          centralBrand,
          brand,
          tradesGivenCentral,
        );
      }

      if (!toCentral && centralIssuer !== issuer && tradesGivenCentral) {
        // We have no amm to-central price authority, make one from trades.
        console.log(
          `Making fake price authority for ${issuerName}-${CENTRAL_ISSUER_NAME}`,
        );
        /** @type {Array<[bigint | number, bigint | number]>} */
        const tradesGivenOther = tradesGivenCentral.map(
          ([valueCentral, valueOther]) => [valueOther, valueCentral],
        );
        toCentral = makeFakePriceAuthority(
          issuer,
          centralIssuer,
          brand,
          centralBrand,
          tradesGivenOther,
        );
      }

      // Register the price pairs.
      await Promise.all(
        [
          [fromCentral, centralBrand, brand],
          [toCentral, brand, centralBrand],
        ].map(async ([pa, fromBrand, toBrand]) => {
          const paPresence = await pa;
          if (!paPresence) {
            return;
          }
          await E(priceAuthorityAdmin).registerPriceAuthority(
            paPresence,
            fromBrand,
            toBrand,
          );
        }),
      );
    }),
  );
};
