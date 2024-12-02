// 遊戲狀態常量
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

class Game {
    constructor() {
        this.canvas = document.getElementById('gameBoard');
        this.ctx = this.canvas.getContext('2d');
        this.boardSize = 15;
        this.boardMargin = 30;
        this.cellSize = (this.canvas.width - 2 * this.boardMargin) / (this.boardSize - 1);
        this.board = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(EMPTY));
        this.currentPlayer = BLACK;
        this.gameOver = false;
        this.moveHistory = [];
        
        this.gameStarted = false;
        this.updateStartButton();
        
        // 初始化計時器但不立即開始
        this.blackTime = 5 * 60;
        this.whiteTime = 5 * 60;
        this.timerInterval = null;
        this.updateTimerDisplay();
        
        // 綁定點擊事件
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.drawBoard();
        
        // 移除自動提示輸入名稱
        this.playerName = null;
        this.blackPlayer = null;
        this.whitePlayer = null;
        
        // 初始化 Firebase
        this.gameRef = firebase.database().ref('games');
        this.currentGameId = null;
        this.initializeGame();
        
        // 綁定按鈕事件
        this.setupEventListeners();
    }

    setupEventListeners() {
        const joinBlackButton = document.getElementById('joinBlackButton');
        const joinWhiteButton = document.getElementById('joinWhiteButton');
        const startButton = document.getElementById('startButton');
        
        joinBlackButton.addEventListener('click', () => {
            if (!this.blackPlayer) {
                this.joinAsPlayer('BLACK', '玩家');
            }
        });
        
        joinWhiteButton.addEventListener('click', () => {
            if (!this.whitePlayer) {
                this.joinAsPlayer('WHITE', '玩家');
            }
        });

        // 添加開始遊戲按鈕事件
        startButton.addEventListener('click', () => this.resetGame());

        // 為悔棋和求和按鈕添加事件監聽
        const undoButton = document.getElementById('undoButton');
        const drawButton = document.getElementById('drawButton');
        
        undoButton.addEventListener('click', () => this.undoMove());
        drawButton.addEventListener('click', () => this.requestDraw());

        // 為聊天輸入添加事件監聽
        const chatInput = document.getElementById('chatInput');
        const chatSendButton = document.querySelector('.chat-send-button');
        
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
        
        chatSendButton.addEventListener('click', () => this.sendMessage());
    }

    initializeGame() {
        // 創建新遊戲
        const newGameRef = this.gameRef.push({
            board: this.board,
            currentPlayer: this.currentPlayer,
            blackPlayer: null,
            whitePlayer: null,
            gameStarted: false,
            gameOver: false,
            blackTime: this.blackTime,
            whiteTime: this.whiteTime,
            moveHistory: [],
            lastUpdateTime: firebase.database.ServerValue.TIMESTAMP
        });

        this.currentGameId = newGameRef.key;

        // 設置遊戲狀態監聽
        this.gameRef.child(this.currentGameId).on('value', (snapshot) => {
            const gameData = snapshot.val();
            if (gameData) {
                this.syncGameState(gameData);
            }
        });
    }

    startTimer() {
        this.updateTimerDisplay();
        this.timerInterval = setInterval(() => {
            if (!this.gameOver) {
                if (this.currentPlayer === BLACK) {
                    this.blackTime--;
                    if (this.blackTime <= 0) {
                        this.gameOver = true;
                        clearInterval(this.timerInterval);
                        alert('黑子時間用盡，白子獲勝！');
                    }
                } else {
                    this.whiteTime--;
                    if (this.whiteTime <= 0) {
                        this.gameOver = true;
                        clearInterval(this.timerInterval);
                        alert('白子時間用盡，黑子獲勝！');
                    }
                }
                this.updateTimerDisplay();
                this.updateButtonsState(); // 每秒更新按鈕狀態
            }
        }, 1000);
    }

    updateTimerDisplay() {
        const blackTimer = document.getElementById('blackTimer');
        const whiteTimer = document.getElementById('whiteTimer');
        const blackContainer = document.getElementById('blackTimerContainer');
        const whiteContainer = document.getElementById('whiteTimerContainer');
        const blackProgress = document.getElementById('blackTimerProgress');
        const whiteProgress = document.getElementById('whiteTimerProgress');

        // 更新時間文字
        blackTimer.textContent = this.formatTime(this.blackTime);
        whiteTimer.textContent = this.formatTime(this.whiteTime);

        // 更新進度條
        const totalTime = 5 * 60;
        const blackPercent = (this.blackTime / totalTime) * 100;
        const whitePercent = (this.whiteTime / totalTime) * 100;

        blackProgress.style.transform = `scaleY(${blackPercent / 100})`;
        whiteProgress.style.transform = `scaleY(${whitePercent / 100})`;

        // 更新警告狀態和當前玩家指示
        blackContainer.className = `timer black-timer${this.getTimerClass(this.blackTime)}${this.currentPlayer === BLACK ? ' active' : ''}`;
        whiteContainer.className = `timer white-timer${this.getTimerClass(this.whiteTime)}${this.currentPlayer === WHITE ? ' active' : ''}`;
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    undoMove() {
        if (this.gameOver || this.moveHistory.length === 0) return;
        
        // 檢查是否是當前玩家的回合
        const currentPlayerName = this.currentPlayer === BLACK ? this.blackPlayer : this.whitePlayer;
        if (currentPlayerName !== this.playerName) return;

        const lastMove = this.moveHistory.pop();
        this.board[lastMove.row][lastMove.col] = EMPTY;
        this.currentPlayer = lastMove.player;
        
        // 恢復時間（加回 3 秒作為補償）
        if (this.currentPlayer === BLACK) {
            this.blackTime = Math.min(300, this.blackTime + 3);
        } else {
            this.whiteTime = Math.min(300, this.whiteTime + 3);
        }
        
        this.gameOver = false;
        this.drawBoard();
        this.updateTimerDisplay();
        
        this.updateButtonsState();
    }

    drawBoard() {
        // 繪製棋盤背景
        this.ctx.fillStyle = '#f0c78a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 繪製網格線
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;

        for (let i = 0; i < this.boardSize; i++) {
            const position = this.boardMargin + i * this.cellSize;
            
            // 垂直線
            this.ctx.beginPath();
            this.ctx.moveTo(position, this.boardMargin);
            this.ctx.lineTo(position, this.canvas.height - this.boardMargin);
            this.ctx.stroke();

            // 水平線
            this.ctx.beginPath();
            this.ctx.moveTo(this.boardMargin, position);
            this.ctx.lineTo(this.canvas.width - this.boardMargin, position);
            this.ctx.stroke();
        }

        // 繪製棋子
        for (let i = 0; i < this.boardSize; i++) {
            for (let j = 0; j < this.boardSize; j++) {
                if (this.board[i][j] !== EMPTY) {
                    this.drawPiece(i, j, this.board[i][j]);
                }
            }
        }
    }

    drawPiece(row, col, player) {
        const x = this.boardMargin + col * this.cellSize;
        const y = this.boardMargin + row * this.cellSize;
        
        // 繪小棋子大小
        const pieceSize = this.cellSize * 0.35; // 調整棋子大小
        
        // 繪製棋子陰影
        this.ctx.beginPath();
        this.ctx.arc(x + 1, y + 1, pieceSize, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fill();
        
        // 繪製棋子
        this.ctx.beginPath();
        this.ctx.arc(x, y, pieceSize, 0, Math.PI * 2);
        this.ctx.fillStyle = player === BLACK ? '#000' : '#fff';
        this.ctx.fill();
        
        if (player === WHITE) {
            this.ctx.strokeStyle = '#000';
            this.ctx.stroke();
        }

        // 如果是最後一手棋，繪製標記
        if (this.moveHistory.length > 0) {
            const lastMove = this.moveHistory[this.moveHistory.length - 1];
            if (row === lastMove.row && col === lastMove.col) {
                this.ctx.beginPath();
                this.ctx.arc(x, y, pieceSize * 0.4, 0, Math.PI * 2);
                this.ctx.fillStyle = player === BLACK ? '#fff' : '#000';
                this.ctx.fill();
            }
        }
    }

    handleClick(e) {
        // 檢查遊戲是否開始
        if (!this.gameStarted) {
            alert('請等待兩位玩家加入並點擊開始遊戲！');
            return;
        }

        if (this.gameOver) return;
        
        // 獲取當前玩家名稱
        const currentPlayerName = this.currentPlayer === BLACK ? this.blackPlayer : this.whitePlayer;
        
        // 檢查是否是當前玩家的回合
        if (this.currentPlayer === BLACK && this.playerName !== this.blackPlayer) {
            console.log('Not black player turn');
            return;
        }
        if (this.currentPlayer === WHITE && this.playerName !== this.whitePlayer) {
            console.log('Not white player turn');
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - this.boardMargin;
        const y = e.clientY - rect.top - this.boardMargin;
        
        const col = Math.round(x / this.cellSize);
        const row = Math.round(y / this.cellSize);

        if (row >= 0 && row < this.boardSize && 
            col >= 0 && col < this.boardSize && 
            this.board[row][col] === EMPTY) {
            this.makeMove(row, col);
        }
    }

    makeMove(row, col) {
        this.board[row][col] = this.currentPlayer;
        this.moveHistory.push({row, col, player: this.currentPlayer});
        
        this.drawBoard();

        if (this.checkWin(row, col)) {
            this.gameOver = true;
            clearInterval(this.timerInterval);
            alert((this.currentPlayer === BLACK ? '黑子' : '白子') + '獲勝！');
            const startButton = document.getElementById('startButton');
            startButton.style.display = 'block';  // 顯示按鈕
            startButton.textContent = '重新開始';  // 設置文字
            startButton.disabled = false;  // 啟用按鈕
            return;
        }

        this.currentPlayer = this.currentPlayer === BLACK ? WHITE : BLACK;
        this.updateButtonsState();
        this.updateGameState();
    }

    checkWin(row, col) {
        const directions = [
            [[0, 1], [0, -1]], // 水平
            [[1, 0], [-1, 0]], // 垂直
            [[1, 1], [-1, -1]], // 對角線
            [[1, -1], [-1, 1]] // 反對角線
        ];

        for (const direction of directions) {
            let count = 1;
            for (const [dx, dy] of direction) {
                let r = row + dx;
                let c = col + dy;
                while (
                    r >= 0 && r < this.boardSize &&
                    c >= 0 && c < this.boardSize &&
                    this.board[r][c] === this.currentPlayer
                ) {
                    count++;
                    r += dx;
                    c += dy;
                }
            }
            if (count >= 5) return true;
        }
        return false;
    }

    // 更新開始/重新開始按鈕
    updateStartButton() {
        const startButton = document.getElementById('startButton');
        if (!this.blackPlayer || !this.whitePlayer) {
            startButton.disabled = true;
            startButton.textContent = '等待玩家加入';
            startButton.classList.remove('glow'); // 移除閃爍效果
        } else if (!this.gameStarted) {
            startButton.disabled = false;
            startButton.textContent = '開始遊戲';
            startButton.classList.add('glow'); // 添加閃爍效果
        } else {
            startButton.disabled = false;
            startButton.textContent = '重新開始';
            startButton.classList.add('glow'); // 添加閃爍效果
        }
    }

    // 添加時間狀態判斷方法
    getTimerClass(time) {
        if (time <= 30) return ' danger';
        if (time <= 60) return ' warning';
        return '';
    }

    // 修改重置遊戲方法
    resetGame() {
        console.log('Resetting game...');
        
        if (!this.blackPlayer || !this.whitePlayer) {
            alert('請等待兩位玩家都加入後再開始遊戲！');
            return;
        }

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        const gameState = {
            board: Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(EMPTY)),
            currentPlayer: BLACK,
            gameStarted: true,
            gameOver: false,
            blackTime: 5 * 60,
            whiteTime: 5 * 60,
            moveHistory: [],
            lastUpdateTime: firebase.database.ServerValue.TIMESTAMP
        };

        // 更新 Firebase
        this.gameRef.child(this.currentGameId).update(gameState, (error) => {
            if (error) {
                console.error('重置遊戲失敗:', error);
                alert('重置遊戲失敗，請重試');
            } else {
                console.log('Game reset successful');
                this.startTimer();
                document.getElementById('startButton').style.display = 'none';  // 隱藏按鈕
            }
        });
    }

    // 添加求和請求方法
    requestDraw() {
        if (!this.gameStarted || this.gameOver) return;
        
        // 檢查是否是當前玩家的回合
        const currentPlayerName = this.currentPlayer === BLACK ? this.blackPlayer : this.whitePlayer;
        if (currentPlayerName !== this.playerName) return;

        if (confirm(this.currentPlayer === BLACK ? '黑子請求和棋，白子是否同意？' : '白子請求和棋，黑子是否同意？')) {
            this.gameOver = true;
            clearInterval(this.timerInterval);
            alert('雙方同意和棋！');
            this.addChatMessage('系統', '雙方同意和棋');
        } else {
            this.addChatMessage('系統', 
                (this.currentPlayer === BLACK ? '白子' : '黑子') + '拒絕和棋請求');
        }
        
        this.updateButtonsState();
    }

    // 添加聊天消息
    addChatMessage(sender, message) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';
        messageDiv.textContent = `${sender}: ${message}`;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 修改 joinAsPlayer 方法，添加玩家名稱存儲
    joinAsPlayer(color, playerName) {
        if (this.gameOver) return;
        
        // 檢查是否已經加入
        if ((color === 'BLACK' && this.blackPlayer) || 
            (color === 'WHITE' && this.whitePlayer)) {
            alert('該位置已被占用！');
            return;
        }

        // 更新 Firebase
        const updateData = {};
        if (color === 'BLACK') {
            updateData.blackPlayer = playerName;
        } else {
            updateData.whitePlayer = playerName;
        }

        this.gameRef.child(this.currentGameId).update(updateData, (error) => {
            if (error) {
                console.error('加入遊戲失敗:', error);
                alert('加入遊戲失敗，請重試');
            } else {
                console.log(`Successfully joined as ${color}`);
                // 本地更新
                this.playerName = playerName; // 保存當前玩家名稱
                if (color === 'BLACK') {
                    this.blackPlayer = playerName;
                } else {
                    this.whitePlayer = playerName;
                }
                this.updateUI();
            }
        });
    }

    // 檢查遊戲是否可以開始
    checkGameReady() {
        const startButton = document.getElementById('startButton');
        const canStart = this.blackPlayer && this.whitePlayer;
        startButton.disabled = !canStart;
        
        if (canStart) {
            startButton.textContent = '開始遊戲';
            startButton.classList.add('glow'); // 添加閃爍效果
        } else {
            startButton.classList.remove('glow'); // 移除閃爍效果
        }
        
        this.updateButtonsState();
    }

    // 添加按鈕狀態更新方法
    updateButtonsState() {
        const undoButton = document.getElementById('undoButton');
        const drawButton = document.getElementById('drawButton');
        
        // 只有在遊戲開始後且不是第一步時才能悔棋
        undoButton.disabled = !this.gameStarted || this.moveHistory.length === 0 || this.gameOver;
        
        // 只有在遊戲開始後且至少下了一步棋時才能求和
        drawButton.disabled = !this.gameStarted || this.moveHistory.length === 0 || this.gameOver;
        
        // 檢查是否是當前玩家的回合
        const currentPlayerName = this.currentPlayer === BLACK ? this.blackPlayer : this.whitePlayer;
        if (currentPlayerName !== this.playerName) {
            undoButton.disabled = true;
            drawButton.disabled = true;
        }
    }

    // 修改 syncGameState 方法
    syncGameState(gameData) {
        if (!gameData) return;
        
        // 更新本地遊戲狀態
        this.blackPlayer = gameData.blackPlayer;
        this.whitePlayer = gameData.whitePlayer;
        this.gameStarted = gameData.gameStarted;
        this.gameOver = gameData.gameOver;
        this.board = gameData.board;
        this.currentPlayer = gameData.currentPlayer;
        this.blackTime = gameData.blackTime;
        this.whiteTime = gameData.whiteTime;
        this.moveHistory = gameData.moveHistory || [];

        // 更新界面
        this.updateUI();
    }

    // 新增更新界面方法
    updateUI() {
        // 更新玩家顯示
        const blackPlayerName = document.getElementById('blackPlayerName');
        const whitePlayerName = document.getElementById('whitePlayerName');
        const joinBlackButton = document.getElementById('joinBlackButton');
        const joinWhiteButton = document.getElementById('joinWhiteButton');

        // 更新黑方玩家
        if (this.blackPlayer) {
            blackPlayerName.textContent = this.blackPlayer;
            document.getElementById('blackPlayerSlot').classList.add('joined');
            joinBlackButton.disabled = true;
        } else {
            blackPlayerName.textContent = '等待加入...';
            document.getElementById('blackPlayerSlot').classList.remove('joined');
            joinBlackButton.disabled = false;
        }

        // 更新白方玩家
        if (this.whitePlayer) {
            whitePlayerName.textContent = this.whitePlayer;
            document.getElementById('whitePlayerSlot').classList.add('joined');
            joinWhiteButton.disabled = true;
        } else {
            whitePlayerName.textContent = '等待加入...';
            document.getElementById('whitePlayerSlot').classList.remove('joined');
            joinWhiteButton.disabled = false;
        }

        // 更新其他界面元素
        this.drawBoard();
        this.updateTimerDisplay();
        this.updateButtonsState();
        this.updateStartButton();
        this.checkGameReady();
    }

    // 修改 updateGameState 方法
    updateGameState() {
        if (this.currentGameId) {
            this.gameRef.child(this.currentGameId).update({
                board: this.board,
                currentPlayer: this.currentPlayer,
                blackPlayer: this.blackPlayer,
                whitePlayer: this.whitePlayer,
                gameStarted: this.gameStarted,
                gameOver: this.gameOver,
                blackTime: this.blackTime,
                whiteTime: this.whiteTime,
                moveHistory: this.moveHistory,
                lastUpdateTime: firebase.database.ServerValue.TIMESTAMP
            }, (error) => {
                if (error) {
                    console.error('更新遊戲狀態失敗:', error);
                }
            });
        }
    }

    // 添加發送消息方法
    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        if (message) {
            this.addChatMessage(this.playerName, message);
            input.value = '';
        }
    }
}

// 移除全局函數，改為使用類方法
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
}); 