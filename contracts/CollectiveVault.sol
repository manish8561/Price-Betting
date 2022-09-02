// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "hardhat/console.sol";

contract CollectiveVault is Ownable, ReentrancyGuard {
    bool initializer = false;
    IERC20 public XIV;
    uint256 public tokenCounter;
    uint256 public constant divisor = 10000;
    uint256 public fees;
    address public operator;

    // mapping for valid tokens
    mapping(uint256 => address) public Tokens;
    mapping(address => bool) public validTokens;

    //mapping for counter
    mapping(uint8 => mapping(address => uint256)) public counter;

    //mapping for priceFeeds
    mapping(address => address) public chainlinkAddress;

    //dynamic values for slots change by admin
    mapping(uint8 => SlotType) public slotPlan;
    struct SlotType {
        uint128 slot; //in seconds
        uint128 userlimit;
        uint256 minimumAmt;
    }
    struct PredictionSlot {
        uint256 totalAmount;
        uint256 finalPrice;
        uint248 endTime;
        bool status;
        address[] user;
    }
    //Prediction Details as per counter, predictionType, Token, Slot
    mapping(uint8 => mapping(address => mapping(uint256 => PredictionSlot)))
        public PredictionDetail;

    struct Prediction {
        uint256 amount;
        uint256 price;
        uint128 predictionTime;
        uint128 status; // 1 pending, 2 win, 3 loss
    }

    //Prediction by user
    mapping(uint8 => mapping(address => mapping(uint256 => mapping(address => Prediction))))
        public UserPrediction;

    event Predictions(
        uint256 indexed counter,
        uint256 amount,
        uint256 price,
        address token,
        uint256 totalAmount,
        uint88 endTime,
        uint8 indexed predictionType,
        address indexed user
    );

    event ResolvedPredictions(
        uint256 indexed counter,
        uint256 amount,
        uint256 price,
        address token,
        uint256 finalPrice,
        uint256 totalAmount,
        address indexed user,
        uint8 indexed predictionType,
        uint88 resolvedTime
    );

    function initialize(
        address xiv,
        address _owner,
        address _operator
    ) external {
        require(!initializer, "CV: Already instialised");
        initializer = true;
        _transferOwnership(_owner);
        operator = _operator;

        //Solo
        slotPlan[1].userlimit = 10;
        slotPlan[1].minimumAmt = 1000e18;
        slotPlan[1].slot = 10800;
        //Shared
        slotPlan[2].userlimit = 10;
        slotPlan[2].minimumAmt = 2000e18;
        slotPlan[2].slot = 10800;
        //User vs User
        slotPlan[3].userlimit = 2;
        slotPlan[3].minimumAmt = 3000e18;
        slotPlan[3].slot = 1800;

        XIV = IERC20(xiv);
        fees = 2500;
    }

    function predict(
        uint256 _amount,
        uint256 _price,
        uint8 _predictionType,
        address _token
    ) external nonReentrant {
        address user = _msgSender();
        require(_price > 0, "CV: Price should be greater than zero");
        require(
            (_predictionType == 1 ||
                _predictionType == 2 ||
                _predictionType == 3),
            "CV: PredictionType should be valid"
        );
        require(validTokens[_token], "CV: Token is not valid");

        SlotType storage slotDetails = slotPlan[_predictionType];
        require(_amount >= slotDetails.minimumAmt, "CV: Invalid Amount");
        uint256 adminFees = (_amount * fees) / divisor;
        //Transfer the XIV
        XIV.transferFrom(user, address(this), _amount);
        XIV.transfer(owner(), adminFees);
        uint256 amt = _amount - adminFees;

        //get counter of prediction details
        uint256 _counter = counter[_predictionType][_token];

        //create the predictionDetail according to slot
        PredictionSlot storage predictionDetails = PredictionDetail[
            _predictionType
        ][_token][_counter];

        if (predictionDetails.endTime > 0) {
            if (predictionDetails.endTime < block.timestamp) {
                //increment the counter
                counter[_predictionType][_token]++;
                _counter = counter[_predictionType][_token];

                predictionDetails = PredictionDetail[_predictionType][_token][
                    _counter
                ];

                predictionDetails.endTime = uint248(
                    block.timestamp + slotDetails.slot
                );
            }
        } else {
            //first time
            predictionDetails.endTime = uint248(
                block.timestamp + slotDetails.slot
            );
        }
        predictionDetails.totalAmount += amt;

        require(
            predictionDetails.user.length < slotDetails.userlimit,
            "CV: User limit exceeded"
        );

        predictionDetails.user.push(user);

        Prediction storage userDetails = UserPrediction[_predictionType][
            _token
        ][_counter][user];

        require(
            userDetails.status == 0,
            "CV: Can't participate twice in a slot"
        );

        userDetails.amount = amt;

        userDetails.price = _price;

        userDetails.predictionTime = uint128(block.timestamp);

        userDetails.status = 1; //pending

        //emit the event Predictions
        emit Predictions(
            _counter,
            _amount,
            _price,
            _token,
            predictionDetails.totalAmount,
            uint88(predictionDetails.endTime),
            _predictionType,
            user
        );
    }

    // Get users list for a particular slot and particular token
    function getUsersList(
        uint8 _predictionType,
        address _token,
        uint256 _counter
    ) public view returns (address[] memory users) {
        return PredictionDetail[_predictionType][_token][_counter].user;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    modifier onlyOperator() {
        require(operator == _msgSender(), "CV: caller is not the operator");
        _;
    }

    //resolving external hit by owner
    function resolving(
        uint8 _predictionType,
        address _token,
        uint256 _counter
    ) public onlyOperator {
        require(_counter > 0, "CV: counter should be greater than zero");
        require(
            (_predictionType == 1 ||
                _predictionType == 2 ||
                _predictionType == 3),
            "CV: PredictionType should be valid"
        );
        require(validTokens[_token], "CV: Token is not valid");

        //create the predictionDetail according to slot
        PredictionSlot storage predictionDetails = PredictionDetail[
            _predictionType
        ][_token][_counter];
        SlotType storage slotDetails = slotPlan[_predictionType];
        require(
            (predictionDetails.status == false &&
                predictionDetails.endTime > 0),
            "CV: End time Error"
        );

        if ((predictionDetails.endTime + (24 * 60 * 60)) < block.timestamp) {
            //call oracale for the final price;
            uint256 finalPrice = 19 * 1e8;
            // uint256 finalPrice = getLastestPrice(_token);
            if (_predictionType != 2) {
                //solo or user-user
                Prediction storage userDetails = UserPrediction[
                    _predictionType
                ][_token][_counter][predictionDetails.user[0]];
                uint256 closest = userDetails.price;
                uint8 winnerCounter;
                address[] memory winners = new address[](slotDetails.userlimit); //winners array
                for (uint8 i = 0; i < predictionDetails.user.length; i++) {
                    //get users
                    address user = predictionDetails.user[i];
                    userDetails = UserPrediction[_predictionType][_token][
                        _counter
                    ][user];

                    uint256 a = abs(
                        int256(userDetails.price) - int256(finalPrice)
                    );
                    uint256 b = abs(int256(closest) - int256(finalPrice));
                    if (a < b) {
                        //solo, user
                        closest = userDetails.price;
                        winners[winnerCounter] = user;
                        winnerCounter++;
                    } else {
                        //loss for everyone
                        userDetails.status = 3; //loss
                        address t = _token;

                        emit ResolvedPredictions(
                            _counter,
                            userDetails.amount,
                            userDetails.price,
                            t,
                            190000000,
                            0,
                            user,
                            _predictionType,
                            uint88(block.timestamp)
                        );
                    }
                }

                fundTransfer(
                    _predictionType,
                    _token,
                    _counter,
                    finalPrice,
                    winners,
                    predictionDetails.totalAmount,
                    winnerCounter
                );
                predictionDetails.status = true;
            }
        }
    }

    //fund transfer to winners for solo and user-user
    function fundTransfer(
        uint8 _predictionType,
        address _token,
        uint256 _counter,
        uint256 _finalPrice,
        address[] memory winners,
        uint256 amount,
        uint8 _winnerCounter
    ) internal {
        for (uint8 i = 0; i < _winnerCounter; i++) {
            Prediction storage userDetails = UserPrediction[_predictionType][
                _token
            ][_counter][winners[i]];
            //last winner
            if (winners[i] == winners[_winnerCounter - 1]) {
                XIV.transfer(winners[_winnerCounter - 1], amount);
                userDetails.status = 2; //win
                emit ResolvedPredictions(
                    _counter,
                    userDetails.amount,
                    userDetails.price,
                    _token,
                    _finalPrice,
                    amount,
                    winners[i],
                    _predictionType,
                    uint88(block.timestamp)
                );
            } else {
                //loss for everyone
                userDetails.status = 3; //loss
                emit ResolvedPredictions(
                    _counter,
                    userDetails.amount,
                    userDetails.price,
                    _token,
                    _finalPrice,
                    0,
                    winners[i],
                    _predictionType,
                    uint88(block.timestamp)
                );
            }
        }
    }

    //resloving shared internal function
    function resolvingShared(
        address _token,
        uint256 _counter,
        address[] calldata winners,
        address oddUser
    ) public onlyOperator {
        PredictionSlot storage predictionDetails = PredictionDetail[2][_token][
            _counter
        ];

        require(
            !PredictionDetail[2][_token][_counter].status,
            "CV: Prediction already resolved."
        );

        uint256 amt = predictionDetails.totalAmount / winners.length;
        address t = _token;

        for (uint8 i = 0; i < predictionDetails.user.length; i++) {
            bool check = false;
            address user = predictionDetails.user[i];
            Prediction storage userDetails = UserPrediction[2][_token][
                _counter
            ][user];
            //handling odd user case
            if (oddUser != address(0) && user == oddUser) {
                userDetails.status = 3;
                //odd case
                XIV.transfer(oddUser, userDetails.amount);
                emit ResolvedPredictions(
                    _counter,
                    userDetails.amount,
                    userDetails.price,
                    t,
                    getLastestPrice(t),
                    0,
                    user,
                    2,
                    uint88(block.timestamp)
                );
                continue;
            }

            for (uint8 j = 0; j < winners.length; j++) {
                if (user == winners[i]) {
                    check = true;
                }
            }
            if (check) {
                //winner
                XIV.transfer(user, amt);
                userDetails.status = 2; //win
                emit ResolvedPredictions(
                    _counter,
                    userDetails.amount,
                    userDetails.price,
                    t,
                    getLastestPrice(t),
                    amt,
                    user,
                    2,
                    uint88(block.timestamp)
                );
            } else {
                //loser
                userDetails.status = 3; //loss
                emit ResolvedPredictions(
                    _counter,
                    userDetails.amount,
                    userDetails.price,
                    t,
                    getLastestPrice(t),
                    0,
                    user,
                    2,
                    uint88(block.timestamp)
                );
            }
        }
        predictionDetails.status = true;
    }

    // to get absolute value
    function abs(int256 x) private pure returns (uint256) {
        return uint256(x >= 0 ? x : -x);
    }

    //set admin commission (fees)
    function setAdminFees(uint256 per) public onlyOwner {
        require(per > 0, "CV: Percentage should be greater then zero");
        fees = per;
    }

    //add token and create counter for new token
    function addToken(address _tokenAddress) public onlyOwner {
        require(!(validTokens[_tokenAddress]), "CV: Token is already added.");
        Tokens[tokenCounter] = _tokenAddress;
        validTokens[_tokenAddress] = true;
        tokenCounter++;
        //creating the counter for 3 types of slots
        for (uint8 i = 1; i <= 3; i++) {
            counter[i][_tokenAddress] = 1;
        }
    }

    //add address for chainLink
    function addChainlinkAddress(
        address _tokenAddress,
        address _chainLinkAddress
    ) public onlyOwner {
        require((validTokens[_tokenAddress]), "CV: Token is disabled.");
        chainlinkAddress[_tokenAddress] = _chainLinkAddress;
    }

    //enable/ disable the tokens
    function setTokenAddress(address _tokenAddress, bool check)
        public
        onlyOwner
    {
        validTokens[_tokenAddress] = check;
    }

    //slotPlan Details
    function setSlotDetails(
        uint8 _predictionType,
        uint128 _slot,
        uint128 _userlimit,
        uint256 _minimumAmt
    ) external onlyOwner {
        require(
            (_predictionType == 1 ||
                _predictionType == 2 ||
                _predictionType == 3),
            "CV: PredictionType should be valid"
        );
        require(_slot > 0, "CV: Time can't be greater then zero");
        require(_userlimit > 0, "CV: UserLimit can't be greater then zero");
        require(_minimumAmt > 0, "CV: Minimum can't be greater then zero");
        slotPlan[_predictionType].slot = _slot;
        slotPlan[_predictionType].userlimit = _userlimit;
        slotPlan[_predictionType].minimumAmt = _minimumAmt;
    }

    function getLastestPrice(address _token) public view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(
            chainlinkAddress[_token]
        );
        (
            ,
            /*uint80 roundID*/
            int256 price, /*uint startedAt*/ /*uint timeStamp*/ /*uint80 answeredInRound*/
            ,
            ,

        ) = priceFeed.latestRoundData();

        return uint256(price);
    }

    function getDecimals(address _token) public view returns (uint8 decimals) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(
            chainlinkAddress[_token]
        );

        return priceFeed.decimals();
    }
}
